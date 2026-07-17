/**
 * Pricing-hints session-lifecycle test.
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 *
 * Reproduces the uncaughtException that fires when the extension's 30s
 * refresh timer (registered in `session_start`) outlives the session:
 *   `ctx.ui.setStatus(...)` inside the captured timer callback hits a
 *   stale `ExtensionContext` after `ctx.newSession()` / `ctx.fork()` /
 *   `ctx.switchSession()` / `ctx.reload()` (or a normal quit), and the
 *   framework's `assertActive()` throws.
 *
 * Contract: `session_shutdown` clears the refresh timer before the session
 *   is invalidated, so the callback never runs against a stale ctx.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `vi.mock` and vi.* calls are hoisted to the top of the file by vitest
// before any import. The homedir shim reads a holder that exists at
// module-evaluation time (before beforeEach runs).
const homedirHolder = vi.hoisted(() => ({ value: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => homedirHolder.value,
  };
});

// Dynamic-imported AFTER vi.mock so the module picks up the faked homedir.
const createExtension = (await import("../extensions/pricing-hints/index.ts"))
  .default as unknown as (pi: unknown) => void;

import type {
  ExtensionAPI,
  ExtensionContext,
  SessionShutdownEvent,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

type CtxUsed = ExtensionContext;
type SessionStartHandler = (
  event: SessionStartEvent,
  ctx: CtxUsed,
) => Promise<void> | void;
type SessionShutdownHandler = (
  event: SessionShutdownEvent,
  ctx: CtxUsed,
) => Promise<void> | void;

interface Mount {
  handlers: {
    session_start: SessionStartHandler[];
    session_shutdown: SessionShutdownHandler[];
  };
}

function mount(): Mount {
  const handlers: Mount["handlers"] = {
    session_start: [],
    session_shutdown: [],
  };
  const api = {
    on(event: string, handler: unknown) {
      if (event === "session_start" || event === "session_shutdown") {
        (handlers[event] as unknown[]).push(handler);
      }
    },
    registerCommand() {
      /* unused here */
    },
  } as unknown as ExtensionAPI;
  createExtension(api);
  return { handlers };
}

function makeCtx(statusCalls: string[]): CtxUsed {
  return {
    ui: {
      setStatus: (_key: string, value: string) => {
        statusCalls.push(value);
      },
    },
    model: {
      provider: "minimax",
      id: "MiniMax-M3",
      cost: {
        input: 0.3,
        output: 1.2,
        cacheRead: 0.06,
        cacheWrite: 0,
      },
    },
  } as unknown as CtxUsed;
}

const SEED = {
  "minimax/MiniMax-M3": {
    cost: { input_cache_hit: 0.06, input_cache_miss: 0.3, output: 1.2 },
  },
};

let tmp = "";

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "pricing-hints-lifecycle-"));
  homedirHolder.value = tmp;
  mkdirSync(join(tmp, ".pi", "agent"), { recursive: true });
  writeFileSync(
    join(tmp, ".pi", "agent", "pricing-cache.json"),
    JSON.stringify(SEED),
  );
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tmp, { recursive: true, force: true });
});

describe("pricing-hints session lifecycle", () => {
  it("clears the refresh timer on session_shutdown (reason=new)", async () => {
    expect(existsSync(join(tmp, ".pi", "agent", "pricing-cache.json"))).toBe(
      true,
    );

    const { handlers } = mount();
    if (!handlers.session_shutdown[0]) {
      throw new Error(
        "extension did not register a session_shutdown handler — it must clear the refresh timer here",
      );
    }

    const calls: string[] = [];
    const ctx = makeCtx(calls);

    await handlers.session_start[0]!(
      { type: "session_start", reason: "startup" },
      ctx,
    );
    const afterStart = calls.length;
    expect(afterStart).toBeGreaterThanOrEqual(1);

    await handlers.session_shutdown[0]!(
      { type: "session_shutdown", reason: "new" },
      ctx,
    );

    expect(() => vi.advanceTimersByTime(120_000)).not.toThrow();
    expect(calls.length).toBe(afterStart);
  });

  it("clears the refresh timer on session_shutdown (reason=quit)", async () => {
    const { handlers } = mount();
    const calls: string[] = [];
    const ctx = makeCtx(calls);

    await handlers.session_start[0]!(
      { type: "session_start", reason: "startup" },
      ctx,
    );
    const afterStart = calls.length;

    await handlers.session_shutdown[0]!(
      { type: "session_shutdown", reason: "quit" },
      ctx,
    );

    expect(() => vi.advanceTimersByTime(120_000)).not.toThrow();
    expect(calls.length).toBe(afterStart);
  });

  it("does not leak a stale timer across consecutive sessions", async () => {
    const { handlers } = mount();
    const calls: string[] = [];

    // Session A.
    await handlers.session_start[0]!(
      { type: "session_start", reason: "startup" },
      makeCtx(calls),
    );
    await handlers.session_shutdown[0]!(
      { type: "session_shutdown", reason: "new" },
      makeCtx(calls),
    );

    // Session B (re-arms the timer at session_start).
    await handlers.session_start[0]!(
      { type: "session_start", reason: "startup" },
      makeCtx(calls),
    );
    const afterBStart = calls.length;
    await handlers.session_shutdown[0]!(
      { type: "session_shutdown", reason: "quit" },
      makeCtx(calls),
    );

    expect(() => vi.advanceTimersByTime(120_000)).not.toThrow();
    expect(calls.length).toBe(afterBStart);
  });
});
