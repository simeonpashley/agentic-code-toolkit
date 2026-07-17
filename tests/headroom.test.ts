import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isLocalHeadroomUrl,
  isRemoteBlocked,
  loadHeadroomConfig,
  loadHeadroomSettings,
} from "../extensions/headroom/config.ts";
import {
  applyCompressionResult,
  buildCompressionPayload,
  convertMessage,
  extractOpenAIText,
  naturalizeHeadroomMarkers,
} from "../extensions/headroom/compression.ts";
import type { AgentMessage } from "../extensions/headroom/types.ts";
import {
  buildSpawnEnv,
  parseLocalEndpoint,
  startPersistentHeadroomProxy,
} from "../extensions/headroom/proxy-manager.ts";
import type { HeadroomConfig } from "../extensions/headroom/types.ts";
function msg(
  role: AgentMessage["role"],
  content: unknown,
  extra: Record<string, unknown> = {},
): AgentMessage {
  return { role, content, ...extra } as unknown as AgentMessage;
}

vi.spyOn(console, "warn").mockImplementation(() => {});

describe("config", () => {
  describe("loadHeadroomConfig defaults", () => {
    it("uses defaults when env is empty and no settings file", () => {
      const cfg = loadHeadroomConfig({}, {});
      expect(cfg.enabled).toBe(true);
      expect(cfg.allowRemote).toBe(false);
      expect(cfg.autoStart).toBe(true);
      expect(cfg.baseUrl).toBe("http://127.0.0.1:8788");
      expect(cfg.mode).toBe("normal");
      expect(cfg.command).toBe("headroom");
      expect(cfg.minContextTokens).toBe(20_000);
      expect(cfg.minMessageChars).toBe(2_000);
      expect(cfg.timeoutMs).toBe(30_000);
    });
  });

  describe("loadHeadroomConfig env precedence", () => {
    it("PI_HEADROOM_ENABLED=0 disables", () => {
      expect(loadHeadroomConfig({ PI_HEADROOM_ENABLED: "0" }, {}).enabled).toBe(
        false,
      );
    });
    it("PI_HEADROOM_URL overrides default baseUrl", () => {
      expect(
        loadHeadroomConfig({ PI_HEADROOM_URL: "http://localhost:9999/" }, {})
          .baseUrl,
      ).toBe("http://localhost:9999");
    });
    it("PI_HEADROOM_MODE=silent sets mode", () => {
      expect(loadHeadroomConfig({ PI_HEADROOM_MODE: "silent" }, {}).mode).toBe(
        "silent",
      );
    });
    it("PI_HEADROOM_ALLOW_REMOTE=1 sets allowRemote", () => {
      expect(
        loadHeadroomConfig({ PI_HEADROOM_ALLOW_REMOTE: "1" }, {}).allowRemote,
      ).toBe(true);
    });
    it("invalid PI_HEADROOM_MODE falls back to normal", () => {
      expect(loadHeadroomConfig({ PI_HEADROOM_MODE: "yelling" }, {}).mode).toBe(
        "normal",
      );
    });
    it("PI_HEADROOM_MIN_CONTEXT_TOKENS below zero falls back to default", () => {
      expect(
        loadHeadroomConfig({ PI_HEADROOM_MIN_CONTEXT_TOKENS: "-5" }, {})
          .minContextTokens,
      ).toBe(20_000);
    });
  });

  describe("loadHeadroomConfig settings file precedence", () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), "headroom-"));
    });
    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it("reads settings.json when present", () => {
      const path = join(tmp, "settings.json");
      writeFileSync(
        path,
        JSON.stringify({ enabled: false, mode: "quiet", minMessageChars: 500 }),
      );
      const settings = loadHeadroomSettings(path);
      expect(settings.enabled).toBe(false);
    });

    it("falls back gracefully on malformed settings.json", () => {
      const path = join(tmp, "settings.json");
      writeFileSync(path, "not-json");
      expect(loadHeadroomSettings(path)).toEqual({});
    });

    it("falls back gracefully on JSON array (not a settings object)", () => {
      const path = join(tmp, "settings.json");
      writeFileSync(path, "[]");
      expect(loadHeadroomSettings(path)).toEqual({});
    });

    it("falls back gracefully on missing file", () => {
      expect(loadHeadroomSettings(join(tmp, "does-not-exist.json"))).toEqual(
        {},
      );
    });
  });

  describe("loadHeadroomConfig precedence: settings > env > default", () => {
    let tmp: string;
    let path: string;
    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), "headroom-"));
      path = join(tmp, "settings.json");
    });
    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it("settings.mode wins over PI_HEADROOM_MODE", () => {
      writeFileSync(path, JSON.stringify({ mode: "quiet" }));
      const settings = loadHeadroomSettings(path);
      const cfg = loadHeadroomConfig({ PI_HEADROOM_MODE: "silent" }, settings);
      expect(cfg.mode).toBe("quiet");
    });

    it("settings.baseUrl wins over PI_HEADROOM_URL", () => {
      writeFileSync(path, JSON.stringify({ baseUrl: "http://localhost:9000" }));
      const settings = loadHeadroomSettings(path);
      const cfg = loadHeadroomConfig(
        { PI_HEADROOM_URL: "http://127.0.0.1:1111" },
        settings,
      );
      expect(cfg.baseUrl).toBe("http://localhost:9000");
    });

    it("env fallback used when settings lacks the key", () => {
      writeFileSync(path, JSON.stringify({ mode: "quiet" }));
      const settings = loadHeadroomSettings(path);
      const cfg = loadHeadroomConfig(
        { PI_HEADROOM_URL: "http://127.0.0.1:9999" },
        settings,
      );
      expect(cfg.mode).toBe("quiet");
      expect(cfg.baseUrl).toBe("http://127.0.0.1:9999");
    });

    it("PI_HEADROOM_TIMEOUT_MS below 100 falls back to default", () => {
      const cfg = loadHeadroomConfig({ PI_HEADROOM_TIMEOUT_MS: "50" }, {});
      expect(cfg.timeoutMs).toBe(30_000);
    });

    it("PI_HEADROOM_TIMEOUT_MS at 100 is accepted", () => {
      const cfg = loadHeadroomConfig({ PI_HEADROOM_TIMEOUT_MS: "100" }, {});
      expect(cfg.timeoutMs).toBe(100);
    });
  });

  describe("isLocalHeadroomUrl", () => {
    it("accepts localhost, 127.0.0.1, ::1, [::1]", () => {
      for (const host of [
        "http://localhost:8788",
        "http://127.0.0.1:8788",
        "http://[::1]:8788",
      ]) {
        expect(isLocalHeadroomUrl(host)).toBe(true);
      }
    });
    it("rejects remote URLs and malformed input", () => {
      for (const host of [
        "http://example.com",
        "https://1.2.3.4",
        "not a url",
        "",
      ]) {
        expect(isLocalHeadroomUrl(host)).toBe(false);
      }
    });
  });

  describe("isRemoteBlocked", () => {
    it("blocks remote when allowRemote=false", () => {
      expect(
        isRemoteBlocked({
          baseUrl: "http://example.com:8788",
          allowRemote: false,
        }),
      ).toBe(true);
    });
    it("allows remote when allowRemote=true", () => {
      expect(
        isRemoteBlocked({
          baseUrl: "http://example.com:8788",
          allowRemote: true,
        }),
      ).toBe(false);
    });
    it("allows loopback even when allowRemote=false", () => {
      expect(
        isRemoteBlocked({
          baseUrl: "http://127.0.0.1:8788",
          allowRemote: false,
        }),
      ).toBe(false);
    });
  });
});

describe("compression", () => {
  describe("convertMessage", () => {
    it("string user → user message with string content", () => {
      const m = convertMessage(msg("user", "hello"));
      expect(m).toEqual({ role: "user", content: "hello" });
    });
    it("user with text content array → joined text", () => {
      const m = convertMessage(
        msg("user", [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ]),
      );
      expect(m).toEqual({ role: "user", content: "a\nb" });
    });
    it("user with only images → placeholder user message", () => {
      const m = convertMessage(
        msg("user", [{ type: "image", data: "abc", mimeType: "image/png" }]),
      );
      expect(m).toEqual({
        role: "user",
        content: "[image omitted from Headroom compression payload]",
      });
    });
    it("assistant with toolCalls → assistant message with tool_calls", () => {
      const m = convertMessage(
        msg("assistant", [
          { type: "text", text: "ok" },
          {
            type: "toolCall",
            id: "t1",
            name: "bash",
            arguments: { cmd: "ls" },
          },
        ]),
      );
      expect(m).toEqual({
        role: "assistant",
        content: "ok",
        tool_calls: [
          {
            id: "t1",
            type: "function",
            function: {
              name: "pi_tool_result",
              arguments: JSON.stringify({ originalToolName: "bash" }),
            },
          },
        ],
      });
    });
    it("toolResult with toolCallId → tool message", () => {
      const m = convertMessage(
        msg("toolResult", "x".repeat(3000), {
          toolCallId: "tc-1",
          toolName: "read",
        }),
      );
      expect(m).toEqual({
        role: "tool",
        content: "x".repeat(3000),
        tool_call_id: "tc-1",
      });
    });
    it("toolResult without toolCallId → undefined", () => {
      const m = convertMessage(msg("toolResult", "x".repeat(3000)));
      expect(m).toBeUndefined();
    });
    it("system role → undefined (not in STANDARD_COMPRESSIBLE_ROLES)", () => {
      const m = convertMessage(msg("system", "be brief"));
      expect(m).toBeUndefined();
    });
  });

  describe("extractOpenAIText", () => {
    it("assistant → string content", () => {
      expect(extractOpenAIText({ role: "assistant", content: "hi" })).toBe(
        "hi",
      );
    });
    it("tool → content string", () => {
      expect(
        extractOpenAIText({ role: "tool", content: "x", tool_call_id: "t" }),
      ).toBe("x");
    });
    it("user with array → joined text parts", () => {
      expect(
        extractOpenAIText({
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        }),
      ).toBe("a\nb");
    });
  });

  describe("buildCompressionPayload", () => {
    it("only marks toolResult with text ≥ minMessageChars as candidate", () => {
      const messages = [
        msg("user", "hi"),
        msg("toolResult", "x".repeat(3000), { toolCallId: "tc-1" }),
      ];
      const payload = buildCompressionPayload(messages, 2_000);
      expect(payload.candidateCount).toBe(1);
      expect(payload.mappings[0]?.applyTo).toBeNull();
      expect(payload.mappings[1]?.applyTo).toBe("toolResult");
    });
    it("android JSON bypass: toolResult starting with [ and containing resource-id is not a candidate", () => {
      const android = JSON.stringify([
        { "resource-id": "com.x:id/foo", text: "x" },
      ]);
      const messages = [msg("toolResult", android, { toolCallId: "tc-1" })];
      const payload = buildCompressionPayload(messages, 10);
      expect(payload.candidateCount).toBe(0);
      expect(payload.mappings[0]?.applyTo).toBeNull();
    });
  });

  describe("applyCompressionResult", () => {
    const original = [
      msg("user", "hi"),
      msg("toolResult", "x".repeat(3000), { toolCallId: "tc-1" }),
    ];

    it("happy path: replaces text on candidate", () => {
      const payload = buildCompressionPayload(original, 2_000);
      const compressed = payload.messages.map((c, i) =>
        i === 1 ? { ...c, content: "compressed" } : c,
      );
      const result = applyCompressionResult(
        original,
        payload.mappings,
        compressed,
        {
          minMessageChars: 2_000,
        },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.appliedMessages).toBe(1);
      expect(result.appliedTokensSaved).toBeGreaterThan(0);
      // noUncheckedIndexedAccess: narrow via length check, not `as`.
      expect(result.messages.length).toBe(2);
      const newTool = result.messages[1]! as { content: string };
      expect(newTool.content).toBe("compressed");
    });

    it("rejects message-count drift", () => {
      const payload = buildCompressionPayload(original, 2_000);
      const result = applyCompressionResult(
        original,
        payload.mappings,
        [payload.messages[0]!],
        {
          minMessageChars: 2_000,
        },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("message-count-changed");
    });

    it("rejects role change on tool-result", () => {
      const payload = buildCompressionPayload(original, 2_000);
      const compressed = payload.messages.map((c, i) =>
        i === 1 ? { ...c, role: "user" as const } : c,
      );
      const result = applyCompressionResult(
        original,
        payload.mappings,
        compressed,
        {
          minMessageChars: 2_000,
        },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/^role-changed:/);
    });

    it("rejects tool_call_id change", () => {
      const payload = buildCompressionPayload(original, 2_000);
      const compressed = payload.messages.map((c, i) =>
        i === 1 ? { ...c, tool_call_id: "different" } : c,
      );
      const result = applyCompressionResult(
        original,
        payload.mappings,
        compressed,
        {
          minMessageChars: 2_000,
        },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("tool-call-id-changed");
    });

    // Note: assistant-tool-calls-changed is enforced by validateAlignedMessage, but
    // applyCompressionResult only invokes the validator for candidates (mapping.applyTo).
    // Assistant messages are never candidates, so this branch is unreachable from
    // applyCompressionResult. The validator exists as a defensive guard for future use.

    it("rejects no-op compression (text unchanged)", () => {
      const payload = buildCompressionPayload(original, 2_000);
      const result = applyCompressionResult(
        original,
        payload.mappings,
        payload.messages,
        {
          minMessageChars: 2_000,
        },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("no-applicable-message-changed");
    });

    it("ignores non-candidate message changes", () => {
      const payload = buildCompressionPayload(original, 2_000);
      const compressed = payload.messages.map((c, i) =>
        i === 0 ? { ...c, content: "proxy-mangled" } : c,
      );
      const result = applyCompressionResult(
        original,
        payload.mappings,
        compressed,
        {
          minMessageChars: 2_000,
        },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("no-applicable-message-changed");
    });
  });
});

const FULL_CONFIG: HeadroomConfig = {
  enabled: true,
  baseUrl: "http://127.0.0.1:8788",
  allowRemote: false,
  autoStart: true,
  mode: "normal",
  command: "headroom",
  minContextTokens: 20_000,
  minMessageChars: 2_000,
  timeoutMs: 30_000,
};

describe("proxy-manager", () => {
  describe("parseLocalEndpoint", () => {
    it("accepts loopback http", () => {
      expect(parseLocalEndpoint("http://127.0.0.1:8788")).toEqual({
        host: "127.0.0.1",
        port: "8788",
      });
      expect(parseLocalEndpoint("http://localhost:8788/")).toEqual({
        host: "127.0.0.1",
        port: "8788",
      });
      expect(parseLocalEndpoint("http://[::1]:8788")).toEqual({
        host: "::1",
        port: "8788",
      });
    });
    it("defaults missing port to 8787", () => {
      expect(parseLocalEndpoint("http://127.0.0.1")).toEqual({
        host: "127.0.0.1",
        port: "8787",
      });
    });
    it("accepts https loopback", () => {
      expect(parseLocalEndpoint("https://localhost:9999")).toEqual({
        host: "127.0.0.1",
        port: "9999",
      });
    });
    it("rejects non-loopback", () => {
      expect(parseLocalEndpoint("http://example.com:8788")).toBeUndefined();
      expect(parseLocalEndpoint("http://1.2.3.4:8788")).toBeUndefined();
    });
    it("rejects non-http(s) schemes", () => {
      expect(parseLocalEndpoint("ftp://localhost:8788")).toBeUndefined();
    });
    it("rejects malformed URLs", () => {
      expect(parseLocalEndpoint("not a url")).toBeUndefined();
    });
  });

  describe("startPersistentHeadroomProxy", () => {
    it("refuses non-loopback URLs (unsupported-local-url)", async () => {
      const result = await startPersistentHeadroomProxy({
        ...FULL_CONFIG,
        baseUrl: "http://example.com:8788",
      });
      expect(result).toEqual({ ok: false, reason: "unsupported-local-url" });
    });
  });

  describe("buildSpawnEnv", () => {
    it("sets HEADROOM_TELEMETRY=off when parent env lacks it", () => {
      const env = buildSpawnEnv({});
      expect(env.HEADROOM_TELEMETRY).toBe("off");
    });
    it("preserves HEADROOM_TELEMETRY from parent env (defaulted, not forced)", () => {
      const env = buildSpawnEnv({ HEADROOM_TELEMETRY: "on" });
      expect(env.HEADROOM_TELEMETRY).toBe("on");
    });
    it("inherits all parent env vars", () => {
      const env = buildSpawnEnv({ FOO: "bar", BAZ: "qux" });
      expect(env.FOO).toBe("bar");
      expect(env.BAZ).toBe("qux");
    });
  });
});
import {
  __test__,
  type HeadroomRuntime,
} from "../extensions/headroom/index.ts";
import { HeadroomHttpClient } from "../extensions/headroom/client.ts";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const {
  isAbortOrTimeoutError,
  renderFooterStatus,
  generateFingerprint,
  handleContextCompression,
  classifyGuardSkipReason,
} = __test__;

function makeCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return {
    hasUI: true,
    signal: new AbortController().signal,
    model: { id: "gpt-4o" },
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      theme: { fg: (_c: string, t: string) => t },
    },
    getContextUsage: () => ({ tokens: 50_000 }),
    ...overrides,
  } as unknown as ExtensionContext;
}

function makeConfig(): HeadroomConfig {
  return {
    enabled: true,
    baseUrl: "http://127.0.0.1:8788",
    allowRemote: false,
    autoStart: false,
    mode: "normal",
    command: "headroom",
    minContextTokens: 20_000,
    minMessageChars: 2_000,
    timeoutMs: 30_000,
  };
}

const baseState = {
  enabled: true,
  proxyOnline: true as boolean | null,
  proxyStarting: false,
  proxyStartAttempted: false,
  remoteWarningShown: false,
  offlineWarningShown: false,
  processing: false,
  lastInputFingerprint: null as string | null,
  lastOutputFingerprint: null as string | null,
  lastGuardSkipCandidateFingerprint: null as string | null,
  lastCompressionTime: 0,
  stats: { attempts: 0, applied: 0, guardSkips: 0, tokensSaved: 0 },
};

describe("index __test__", () => {
  describe("isAbortOrTimeoutError", () => {
    it("matches TimeoutError / AbortError names", () => {
      expect(isAbortOrTimeoutError({ name: "AbortError" })).toBe(true);
      expect(isAbortOrTimeoutError({ name: "TimeoutError" })).toBe(true);
    });
    it("matches by message substring", () => {
      expect(isAbortOrTimeoutError({ message: "operation was aborted" })).toBe(
        true,
      );
      expect(isAbortOrTimeoutError({ message: "aborted due to timeout" })).toBe(
        true,
      );
    });
    it("walks nested .cause", () => {
      expect(isAbortOrTimeoutError({ cause: { name: "AbortError" } })).toBe(
        true,
      );
    });
    it("returns false for non-errors and unrelated messages", () => {
      expect(isAbortOrTimeoutError(null)).toBe(false);
      expect(isAbortOrTimeoutError({})).toBe(false);
      expect(isAbortOrTimeoutError({ message: "network down" })).toBe(false);
    });
  });

  describe("renderFooterStatus", () => {
    it("renders each of the six states", () => {
      const ctx = makeCtx();
      const config = makeConfig();
      const stats = baseState.stats;
      expect(
        renderFooterStatus(
          ctx,
          { ...config, enabled: false },
          { ...baseState, enabled: false, stats },
        ),
      ).toContain("off");
      expect(
        renderFooterStatus(
          ctx,
          { ...config, allowRemote: false, baseUrl: "http://example.com:8788" },
          { ...baseState, stats },
        ),
      ).toContain("blocked");
      expect(
        renderFooterStatus(ctx, config, {
          ...baseState,
          proxyOnline: false,
          proxyStarting: true,
          proxyStartAttempted: true,
          stats,
        }),
      ).toContain("starting");
      expect(
        renderFooterStatus(ctx, config, {
          ...baseState,
          proxyOnline: false,
          proxyStartAttempted: true,
          stats,
        }),
      ).toContain("not running");
      expect(
        renderFooterStatus(ctx, config, {
          ...baseState,
          proxyOnline: null,
          stats,
        }),
      ).toContain("idle");
      expect(
        renderFooterStatus(ctx, config, {
          ...baseState,
          proxyOnline: true,
          stats,
        }),
      ).toContain("active");
    });
  });

  describe("generateFingerprint", () => {
    it("is stable across calls with same content", () => {
      const messages = [msg("user", "hi"), msg("assistant", "hello")];
      expect(generateFingerprint(messages)).toBe(generateFingerprint(messages));
    });
    it("changes when content changes", () => {
      expect(generateFingerprint([msg("user", "hi")])).not.toBe(
        generateFingerprint([msg("user", "bye")]),
      );
    });
  });

  describe("classifyGuardSkipReason", () => {
    it("classifies common churn as silent", () => {
      expect(classifyGuardSkipReason("no-applicable-message-changed")).toBe(
        "silent",
      );
      expect(classifyGuardSkipReason("no-estimated-token-savings")).toBe(
        "silent",
      );
    });
    it("classifies alignment-violation bugs as error", () => {
      expect(classifyGuardSkipReason("message-count-changed")).toBe("error");
      expect(classifyGuardSkipReason("role-changed:user->tool")).toBe("error");
      expect(classifyGuardSkipReason("tool-call-id-changed")).toBe("error");
      expect(classifyGuardSkipReason("target-content-unreplaceable")).toBe(
        "error",
      );
      expect(classifyGuardSkipReason("assistant-tool-calls-changed")).toBe(
        "error",
      );
    });
  });

  describe("handleContextCompression", () => {
    function makeClientStub() {
      const compress = vi.fn(async () => ({
        messages: [] as never[],
        tokensBefore: 0,
        tokensAfter: 0,
        tokensSaved: 0,
        compressionRatio: 1,
        transformsApplied: [],
        ccrHashes: [],
        compressed: false,
      }));
      const client = {
        compress,
        health: vi.fn(async () => true),
        probe: vi.fn(async () => true),
        stats: vi.fn(async () => ({})),
      } as unknown as HeadroomHttpClient;
      return { client, compress };
    }

    function makeRuntime(
      overrides: {
        client?: HeadroomHttpClient;
        state?: Partial<typeof baseState>;
      } = {},
    ): HeadroomRuntime {
      const { client, compress } = makeClientStub();
      return {
        pi: { events: { emit: vi.fn() } } as unknown as HeadroomRuntime["pi"],
        config: makeConfig(),
        client: overrides.client ?? client,
        state: { ...baseState, ...overrides.state } as HeadroomRuntime["state"],
        refreshStatus: () => {},
        updateHealth: async () => true,
        ensureProxy: async () => true,
      };
    }

    it("skips when below minContextTokens", async () => {
      const ctx = makeCtx({ getContextUsage: () => ({ tokens: 1_000 }) });
      const runtime = makeRuntime();
      const result = await handleContextCompression(
        runtime,
        {
          messages: [
            msg("toolResult", "x".repeat(3000), { toolCallId: "tc-1" }),
          ],
        },
        ctx,
      );
      expect(result).toBeUndefined();
      expect(
        runtime.client.compress as unknown as ReturnType<typeof vi.fn>,
      ).not.toHaveBeenCalled();
    });

    it("calls compress once on the happy path and returns compressed messages", async () => {
      const ctx = makeCtx();
      const tool = msg("toolResult", "x".repeat(4000), { toolCallId: "tc-1" });
      const messages = [msg("user", "hi"), tool];
      const payload = buildCompressionPayload(messages, 2_000);
      const compressed = payload.messages.map((c, i) =>
        i === 1 ? { ...c, content: "compressed text" } : c,
      );
      const stub = makeClientStub();
      stub.compress.mockResolvedValueOnce({
        messages: compressed,
        tokensBefore: 1_000,
        tokensAfter: 100,
        tokensSaved: 900,
        compressionRatio: 0.1,
        transformsApplied: ["trim"],
        ccrHashes: [],
        compressed: true,
      });
      const runtime = makeRuntime({ client: stub.client });
      const result = await handleContextCompression(runtime, { messages }, ctx);
      expect(stub.compress).toHaveBeenCalledTimes(1);
      expect(result?.messages).toBeDefined();
      const msgs = result?.messages;
      expect(msgs?.length).toBe(2);
      expect((msgs?.[1] as { content: string } | undefined)?.content).toBe(
        "compressed text",
      );
    });

    it("breaks the loop: input fingerprint === last output skips (already compressed this)", async () => {
      const ctx = makeCtx();
      const messages = [
        msg("toolResult", "x".repeat(4000), { toolCallId: "tc-1" }),
      ];
      const stub = makeClientStub();
      const fp = generateFingerprint(messages);
      const runtime = makeRuntime({
        client: stub.client,
        state: { lastOutputFingerprint: fp },
      });
      const result = await handleContextCompression(runtime, { messages }, ctx);
      expect(result).toBeUndefined();
      expect(stub.compress).not.toHaveBeenCalled();
    });

    it("breaks the loop: input fingerprint === last input skips (no change)", async () => {
      const ctx = makeCtx();
      const messages = [
        msg("toolResult", "x".repeat(4000), { toolCallId: "tc-1" }),
      ];
      const stub = makeClientStub();
      const fp = generateFingerprint(messages);
      const runtime = makeRuntime({
        client: stub.client,
        state: { lastInputFingerprint: fp, lastOutputFingerprint: null },
      });
      const result = await handleContextCompression(runtime, { messages }, ctx);
      expect(result).toBeUndefined();
      expect(stub.compress).not.toHaveBeenCalled();
    });

    it("skips when candidate fingerprint === last guard-skip fingerprint", async () => {
      const ctx = makeCtx();
      const messages = [
        msg("toolResult", "x".repeat(4000), { toolCallId: "tc-1" }),
      ];
      const stub = makeClientStub();
      const payload = buildCompressionPayload(messages, 2_000);
      const runtime = makeRuntime({ client: stub.client });
      stub.compress.mockResolvedValueOnce({
        messages: payload.messages,
        tokensBefore: 1000,
        tokensAfter: 1000,
        tokensSaved: 0,
        compressionRatio: 1,
        transformsApplied: [],
        ccrHashes: [],
        compressed: false,
      });
      await handleContextCompression(runtime, { messages }, ctx);
      const fp = runtime.state.lastGuardSkipCandidateFingerprint;
      const stub2 = makeClientStub();
      const runtime2 = makeRuntime({
        client: stub2.client,
        state: { lastGuardSkipCandidateFingerprint: fp },
      });
      const result = await handleContextCompression(
        runtime2,
        { messages },
        ctx,
      );
      expect(result).toBeUndefined();
      expect(stub2.compress).not.toHaveBeenCalled();
    });

    it("skips when candidateCount === 0", async () => {
      const ctx = makeCtx();
      const messages = [msg("toolResult", "tiny", { toolCallId: "tc-1" })];
      const stub = makeClientStub();
      const runtime = makeRuntime({ client: stub.client });
      const result = await handleContextCompression(runtime, { messages }, ctx);
      expect(result).toBeUndefined();
      expect(stub.compress).not.toHaveBeenCalled();
    });

    it("skips when proxyOnline !== true", async () => {
      const ctx = makeCtx();
      const messages = [
        msg("toolResult", "x".repeat(4000), { toolCallId: "tc-1" }),
      ];
      const stub = makeClientStub();
      const runtime = makeRuntime({
        client: stub.client,
        state: { proxyOnline: false, lastCompressionTime: Date.now() - 10_000 },
      });
      const result = await handleContextCompression(runtime, { messages }, ctx);
      expect(result).toBeUndefined();
      expect(stub.compress).not.toHaveBeenCalled();
    });

    it("respects throttle window (3s)", async () => {
      const ctx = makeCtx();
      const messages = [
        msg("toolResult", "x".repeat(4000), { toolCallId: "tc-1" }),
      ];
      const stub = makeClientStub();
      const runtime = makeRuntime({
        client: stub.client,
        state: { lastCompressionTime: Date.now() - 1_000 },
      });
      const result = await handleContextCompression(runtime, { messages }, ctx);
      expect(result).toBeUndefined();
      expect(stub.compress).not.toHaveBeenCalled();
    });
  });
});
