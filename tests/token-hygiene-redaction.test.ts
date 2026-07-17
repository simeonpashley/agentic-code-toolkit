/**
 * TDD suite for HMAC-backed redaction and metric event serialization.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md
 *
 * Covers:
 *   - redactText: pattern-based secret redaction, encoding normalization
 *   - createIdentifierHasher: HMAC-SHA-256 key generation, storage, stability
 *   - serializeMetricEvent: allowlisted schemas, fail-closed for unknown shapes
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  redactText,
  createIdentifierHasher,
  serializeMetricEvent,
  type IdentifierHasher,
} from "../extensions/token-hygiene/redaction";

// ── Helpers ───────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentic-code-toolkit-redaction-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeHasher(piConfigDir?: string): IdentifierHasher {
  return createIdentifierHasher({ piConfigDir: piConfigDir ?? tmpDir });
}

// ── redactText ───────────────────────────────────────────────────────

describe("redactText", () => {
  it("redacts common secret patterns in plain text", () => {
    const input = "Bearer sk-ant-api03-secret1234567890abcdef more text";
    const result = redactText(input);
    expect(result.redacted).not.toContain(
      "sk-ant-api03-secret1234567890abcdef",
    );
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("redacts multiple secret occurrences", () => {
    const input =
      "key1=ghp_abcdefghijklmnopqrstuvwxyz1234567890 and key2=ghp_1234567890abcdefghijklmnopqrstuvwxyz";
    const result = redactText(input);
    expect(result.count).toBeGreaterThanOrEqual(2);
  });

  it("preserves non-secret text", () => {
    const input = "hello world normal text 123";
    const result = redactText(input);
    expect(result.redacted).toBe(input);
    expect(result.count).toBe(0);
  });

  it("redacts env-style secret assignments", () => {
    const input = "export SECRET_KEY=sk-my-secret-that-needs-redaction";
    const result = redactText(input);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.redacted).toContain("[REDACTED:");
  });

  it("redacts bearer tokens", () => {
    const input =
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNqP";
    const result = redactText(input);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("redacts private URLs with encoded credentials", () => {
    const input = "https://user:secret@private.example.com/data";
    const result = redactText(input);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("redacts SSH private keys (PEM)", () => {
    const input =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
    const result = redactText(input);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("redacts PAT-like tokens", () => {
    const input = "github_pat_11AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const result = redactText(input);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("normalizes URL-encoded secrets before matching", () => {
    const input = "token=sk%2Dlive%2Dsecretkey1234567890abcdef";
    const result = redactText(input);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("returns original text untouched when no patterns match", () => {
    const input =
      "This is completely innocuous content with nothing sensitive.";
    const result = redactText(input);
    expect(result.redacted).toBe(input);
    expect(result.count).toBe(0);
  });

  it("handles empty string", () => {
    const result = redactText("");
    expect(result.redacted).toBe("");
    expect(result.count).toBe(0);
  });

  it("handles non-UTF-8 or undecodable input by returning the input verbatim", () => {
    const buf = Buffer.from([0xff, 0xfe, 0x00, 0x61]);
    const input = buf.toString("latin1");
    const result = redactText(input);
    expect(typeof result.redacted).toBe("string");
    expect(result.count).toBe(0);
  });
});

// ── createIdentifierHasher ──────────────────────────────────────────

describe("createIdentifierHasher", () => {
  it("creates a hasher with an HMAC-SHA-256 key", () => {
    const hasher = makeHasher();
    expect(hasher).toBeDefined();
    expect(typeof hasher.hash).toBe("function");
  });

  it("generates a 32-byte key on first invocation", () => {
    const keyPath = join(tmpDir, "token-hygiene-hmac-key");
    expect(existsSync(keyPath)).toBe(false);
    makeHasher(tmpDir);
    expect(existsSync(keyPath)).toBe(true);
    const keyFile = readFileSync(keyPath);
    expect(keyFile.length).toBe(32);
  });

  it("produces stable identifiers for the same input", () => {
    const hasher = makeHasher();
    const hash1 = hasher.hash("some-identifier");
    const hash2 = hasher.hash("some-identifier");
    expect(hash1).toBe(hash2);
  });

  it("produces different identifiers for different inputs", () => {
    const hasher = makeHasher();
    const hash1 = hasher.hash("path/to/file-a.ts");
    const hash2 = hasher.hash("path/to/file-b.ts");
    expect(hash1).not.toBe(hash2);
  });

  it("produces hex-encoded strings", () => {
    const hasher = makeHasher();
    const hash = hasher.hash("test");
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("never contains the original identifier value", () => {
    const hasher = makeHasher();
    const original = "/Users/test/project/secret-file.ts";
    const hash = hasher.hash(original);
    expect(hash).not.toContain(original);
    expect(hash).not.toContain("secret-file");
    expect(hash).not.toContain("Users");
  });

  it("uses HMAC-SHA-256, not a plain hash", () => {
    const dirA = join(tmpDir, "a");
    const dirB = join(tmpDir, "b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    const hasherA = createIdentifierHasher({ piConfigDir: dirA });
    const hasherB = createIdentifierHasher({ piConfigDir: dirB });
    const hashA = hasherA.hash("same-input");
    const hashB = hasherB.hash("same-input");
    expect(hashA).not.toBe(hashB);
  });

  it("reuses an existing key across hasher instances", () => {
    const dir = join(tmpDir, "shared");
    mkdirSync(dir, { recursive: true });
    const hasher1 = createIdentifierHasher({ piConfigDir: dir });
    const hash1 = hasher1.hash("persistent-id");
    const hasher2 = createIdentifierHasher({ piConfigDir: dir });
    const hash2 = hasher2.hash("persistent-id");
    expect(hash1).toBe(hash2);
  });

  it("stores key under piConfigDir in a predictable named file", () => {
    const dir = join(tmpDir, "custom-config");
    mkdirSync(dir, { recursive: true });
    makeHasher(dir);
    const keyPath = join(dir, "token-hygiene-hmac-key");
    expect(existsSync(keyPath)).toBe(true);
  });

  it("creates parent directory if it does not exist", () => {
    const nestedDir = join(tmpDir, "a", "b", "c");
    makeHasher(nestedDir);
    const keyPath = join(nestedDir, "token-hygiene-hmac-key");
    expect(existsSync(keyPath)).toBe(true);
  });
});

// ── serializeMetricEvent ───────────────────────────────────────────

describe("serializeMetricEvent", () => {
  it("serializes a known event schema to a redacted JSON string", () => {
    const hasher = makeHasher();
    const event = {
      type: "tool_call" as const,
      toolName: "read",
      toolCallId: "call-123",
      input: { path: "/private/file.ts", offset: 10, limit: 50 },
      timestamp: new Date().toISOString(),
    };
    const result = serializeMetricEvent(event, hasher);
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe("tool_call");
    expect(parsed.toolCallId).toBe("call-123");
    expect(parsed.input?.path).toBeDefined();
    expect(parsed.input?.path).not.toBe("/private/file.ts");
  });

  it("returns a redaction_failure JSON string for unknown event shapes", () => {
    const hasher = makeHasher();
    const unknownEvent = { unknown: true, raw: "sensitive data" };
    const result = serializeMetricEvent(unknownEvent, hasher);
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe("redaction_failure");
    expect(parsed.source).toBeDefined();
    const resultStr = JSON.stringify(parsed);
    expect(resultStr).not.toContain("sensitive data");
  });

  it("returns a redaction_failure for unrecognized event types", () => {
    const hasher = makeHasher();
    const unknownEvent = { type: "totally_unknown", raw: "sensitive data" };
    const result = serializeMetricEvent(unknownEvent, hasher);
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe("redaction_failure");
    expect(parsed.source).toBeDefined();
    const resultStr = JSON.stringify(parsed);
    expect(resultStr).not.toContain("sensitive data");
  });

  it("includes timestamp and estimatorVersion when available", () => {
    const hasher = makeHasher();
    const event = {
      type: "context_snapshot" as const,
      estimatedContextTokens: 5000,
      contextWindow: 200000,
      percent: 2.5,
      estimatorVersion: 1,
      buckets: [],
      timestamp: new Date().toISOString(),
    };
    const result = serializeMetricEvent(event, hasher);
    const parsed = JSON.parse(result);
    expect(parsed.estimatorVersion).toBe(1);
    expect(parsed.timestamp).toBeDefined();
  });

  it("redacts path-like fields in tool_call events", () => {
    const hasher = makeHasher();
    const event = {
      type: "tool_call" as const,
      toolName: "read",
      toolCallId: "call-456",
      input: {
        path: "/home/user/project/.env.production",
        offset: 1,
        limit: 100,
      },
    };
    const result = serializeMetricEvent(event, hasher);
    const parsed = JSON.parse(result);
    expect(parsed.input.path).not.toBe("/home/user/project/.env.production");
    expect(parsed.input.path).toMatch(/^[0-9a-f]{64}$/);
  });

  it("redacts query/pattern fields in search tool_call events", () => {
    const hasher = makeHasher();
    const event = {
      type: "tool_call" as const,
      toolName: "grep",
      toolCallId: "call-789",
      input: { pattern: "password=.*", path: "config/" },
    };
    const result = serializeMetricEvent(event, hasher);
    const parsed = JSON.parse(result);
    expect(parsed.input.pattern).not.toBe("password=.*");
    expect(parsed.input.pattern).toMatch(/^[0-9a-f]{64}$/);
  });

  it("passes through allowed fields without redaction", () => {
    const hasher = makeHasher();
    const event = {
      type: "tool_call" as const,
      toolName: "read",
      toolCallId: "call-012",
      input: { path: "/safe/path.ts", offset: 10, limit: 50, raw: true },
    };
    const result = serializeMetricEvent(event, hasher);
    const parsed = JSON.parse(result);
    expect(parsed.input.offset).toBe(10);
    expect(parsed.input.limit).toBe(50);
    expect(parsed.input.raw).toBe(true);
  });
});
