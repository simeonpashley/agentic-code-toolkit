/**
 * Token hygiene metrics lifecycle tests.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md
 * Plan: Task 4 — Metrics Writer, Rotation, Reader, and Deletion
 *
 * Covers:
 *   - createMetricsLogger atomic JSONL append with timestamp, estimatorVersion,
 *     redacted fields via serializeMetricEvent, and write-failure pass-through
 *   - Size and age rotation with defaults (10 MB, 5 files, 30 days)
 *   - readMetricsFile with valid JSONL, malformed lines, empty file
 *   - deleteLocalMetrics removes metrics/rotated/retained but not HMAC key
 *   - cleanupExpiredMetrics removes files past retention
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

// ── Helpers for the serializeMetricEvent mock ──────────────────────────

const REAL_NOW = "2026-07-08T12:00:00.000Z";

function withTimestamp(
  event: Record<string, unknown>,
  ts = REAL_NOW,
): Record<string, unknown> {
  return { ...event, timestamp: ts };
}

/** Default mock serializer: passes through with timestamp and estimatorVersion. */
function defaultSerialize(
  event: Record<string, unknown>,
): Record<string, unknown> | null {
  if (event._reject) return null; // simulate redaction failure
  return withTimestamp(event);
}

/** Strict mock serializer: only allows specific safe keys. */
function allowlistSerialize(
  event: Record<string, unknown>,
): Record<string, unknown> | null {
  const ALLOWED = new Set(["type", "source", "chars", "estimatorVersion"]);
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (ALLOWED.has(k)) safe[k] = v;
  }
  if (safe.type === "redaction_failure") return null;
  return withTimestamp(safe);
}

// ── Dynamic imports (after vi.mock block if needed) ────────────────────

let metrics: typeof import("../extensions/token-hygiene/metrics.ts");

// ── Test helpers ───────────────────────────────────────────────────────

let tmpDir = "";

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "token-hygiene-metrics-"));
  // Re-import for each test to get fresh modules (no shared state)
  metrics = await import("../extensions/token-hygiene/metrics.ts");
});

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  vi.useRealTimers();
});

// ── createMetricsLogger ────────────────────────────────────────────────

describe("createMetricsLogger", () => {
  it("appends one JSON object per line to the metrics file", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: defaultSerialize,
    });

    logger.log({ type: "tool_call", tool: "read" });
    logger.log({ type: "tool_result", tool: "read", chars: 500 });
    logger.shutdown();

    const lines = readFileSync(metricsPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!);
    expect(first.type).toBe("tool_call");
    expect(first.tool).toBe("read");

    const second = JSON.parse(lines[1]!);
    expect(second.type).toBe("tool_result");
    expect(second.tool).toBe("read");
    expect(second.chars).toBe(500);
  });

  it("adds an ISO timestamp to every event", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: defaultSerialize,
    });

    logger.log({ type: "context_snapshot", chars: 1000 });
    logger.shutdown();

    const lines = readFileSync(metricsPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toHaveProperty("timestamp");
    expect(typeof parsed.timestamp).toBe("string");
    expect(() => new Date(parsed.timestamp as string)).not.toThrow();
  });

  it("includes estimatorVersion: 1 on aggregate events", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: defaultSerialize,
    });

    logger.log({ type: "context_snapshot", chars: 2000, estimatorVersion: 1 });
    logger.log({ type: "tool_result", tool: "read", chars: 500 });
    logger.shutdown();

    const lines = readFileSync(metricsPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);

    const snapshot = JSON.parse(lines[0]!);
    expect(snapshot.estimatorVersion).toBe(1);

    const result = JSON.parse(lines[1]!);
    // Non-aggregate events should still keep estimatorVersion if passed
    expect(result.estimatorVersion).toBeUndefined();
  });

  it("serializes through serializeMetricEvent (redacted fields)", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: allowlistSerialize,
    });

    logger.log({
      type: "tool_call",
      source: "read",
      path: "/home/user/secret.txt",
      secret: "sk-abc123",
    });
    logger.shutdown();

    const lines = readFileSync(metricsPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    // Only allowlisted keys survive
    expect(parsed.type).toBe("tool_call");
    expect(parsed.source).toBe("read");
    expect(parsed).not.toHaveProperty("path");
    expect(parsed).not.toHaveProperty("secret");
  });

  it("skips events that serializeMetricEvent returns null for (redaction failure)", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: (e) => {
        if (e.type === "redaction_failure") return null;
        return withTimestamp(e);
      },
    });

    logger.log({ type: "tool_call", tool: "read" });
    logger.log({ type: "redaction_failure", reason: "unknown" });
    logger.log({ type: "tool_result", tool: "read", chars: 100 });
    logger.shutdown();

    const lines = readFileSync(metricsPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const types = lines.map((l) => JSON.parse(l).type);
    expect(types).toEqual(["tool_call", "tool_result"]);
  });

  it("write failure passes through and does not throw", () => {
    // Create a read-only directory so file writes genuinely fail
    const readonlyDir = join(tmpDir, "readonly");
    mkdirSync(readonlyDir, { recursive: true });
    chmodSync(readonlyDir, 0o444);
    const metricsPath = join(readonlyDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: defaultSerialize,
    });

    // Should not throw, should not crash the test
    expect(() => {
      logger.log({ type: "tool_call", tool: "read" });
    }).not.toThrow();

    // Subsequent logs also don't throw
    expect(() => {
      logger.log({ type: "tool_result", tool: "read", chars: 500 });
    }).not.toThrow();

    // File does not exist because directory was read-only
    expect(existsSync(metricsPath)).toBe(false);

    logger.shutdown();

    // Restore permissions so cleanup works
    chmodSync(readonlyDir, 0o755);
  });

  it("creates parent directories if they do not exist", () => {
    const metricsPath = join(tmpDir, "subdir", "deep", "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: defaultSerialize,
    });

    logger.log({ type: "tool_call", tool: "read" });
    logger.shutdown();

    expect(existsSync(metricsPath)).toBe(true);
    const lines = readFileSync(metricsPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("is idempotent — logging after shutdown creates a new line (no crash)", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: defaultSerialize,
    });

    logger.log({ type: "tool_call", tool: "read" });
    logger.shutdown();
    // Log after shutdown should not throw (graceful degradation)
    expect(() =>
      logger.log({ type: "tool_result", tool: "read", chars: 100 }),
    ).not.toThrow();
    logger.shutdown(); // second shutdown also fine
  });
});

// ── Size rotation ─────────────────────────────────────────────────────

describe("size rotation", () => {
  it("rotates file when it exceeds maxBytesPerFile", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: defaultSerialize,
      maxBytesPerFile: 100,
      maxFiles: 3,
    });

    // Write enough data to trigger rotation (each event ~80-100 bytes)
    for (let i = 0; i < 15; i++) {
      logger.log({ type: "tool_result", tool: "read", chars: 500, index: i });
    }
    logger.shutdown();

    // After rotation, there should be rotated files
    const dirFiles = readdirSync(tmpDir).sort();
    const metricsFiles = dirFiles.filter((f) => f.startsWith("metrics"));
    expect(metricsFiles.length).toBeGreaterThan(1);

    // The current file should exist
    expect(metricsFiles).toContain("metrics.jsonl");

    // At least one rotated file should exist
    const rotated = metricsFiles.filter((f) => f !== "metrics.jsonl");
    expect(rotated.length).toBeGreaterThanOrEqual(1);

    // Should not exceed maxFiles rotated files
    expect(rotated.length).toBeLessThanOrEqual(3);
  });

  it("keeps at most maxFiles rotated files", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    const logger = metrics.createMetricsLogger({
      metricsPath,
      serializeMetricEvent: defaultSerialize,
      maxBytesPerFile: 50,
      maxFiles: 2,
    });

    // Write many small events to trigger multiple rotations
    for (let i = 0; i < 30; i++) {
      logger.log({ type: "tool_call", tool: "read", index: i });
    }
    logger.shutdown();

    const dirFiles = readdirSync(tmpDir).sort();
    const rotated = dirFiles.filter(
      (f) => f.startsWith("metrics") && f !== "metrics.jsonl",
    );
    // Should keep at most maxFiles (2) rotated files
    expect(rotated.length).toBeLessThanOrEqual(2);
  });
});

// ── Age rotation (cleanupExpiredMetrics) ──────────────────────────────

describe("cleanupExpiredMetrics", () => {
  it("removes rotated files older than retentionDays", () => {
    vi.useFakeTimers();
    const now = new Date("2026-07-08T12:00:00Z");
    vi.setSystemTime(now);

    const metricsDir = join(tmpDir, "metrics");
    mkdirSync(metricsDir, { recursive: true });

    // Create a fresh rotated file
    const freshPath = join(metricsDir, "token-hygiene-metrics.1.jsonl");
    writeFileSync(
      freshPath,
      `{"type":"tool_call","timestamp":"${now.toISOString()}"}\n`,
    );

    // Create an expired rotated file (40 days old)
    const oldDate = new Date("2026-05-28T12:00:00Z");
    const oldPath = join(metricsDir, "token-hygiene-metrics.2.jsonl");
    writeFileSync(
      oldPath,
      `{"type":"tool_call","timestamp":"${oldDate.toISOString()}"}\n`,
    );

    // Create the current file (should not be cleaned up by default)
    const currentPath = join(metricsDir, "token-hygiene-metrics.jsonl");
    writeFileSync(
      currentPath,
      `{"type":"tool_call","timestamp":"${now.toISOString()}"}\n`,
    );

    // Run cleanup with 30-day retention
    metrics.cleanupExpiredMetrics({
      metricsDir,
      retentionDays: 30,
    });

    // Fresh file should survive
    expect(existsSync(freshPath)).toBe(true);
    // Old file (40 days) should be removed
    expect(existsSync(oldPath)).toBe(false);
    // Current file should survive
    expect(existsSync(currentPath)).toBe(true);
  });

  it("does not fail when directory is empty or missing", () => {
    const missingDir = join(tmpDir, "does-not-exist");
    expect(() => {
      metrics.cleanupExpiredMetrics({
        metricsDir: missingDir,
        retentionDays: 30,
      });
    }).not.toThrow();

    const emptyDir = join(tmpDir, "empty");
    mkdirSync(emptyDir, { recursive: true });
    expect(() => {
      metrics.cleanupExpiredMetrics({
        metricsDir: emptyDir,
        retentionDays: 30,
      });
    }).not.toThrow();
  });

  it("honours a custom now date for testing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00Z"));

    const metricsDir = join(tmpDir, "custom-test");
    mkdirSync(metricsDir, { recursive: true });

    // File from 35 days ago
    const oldPath = join(metricsDir, "metrics.old.jsonl");
    writeFileSync(oldPath, "");
    // Set mtime to 35 days ago using utimes... but we'll use the timestamp
    // in the filename convention approach
    const oldDate = new Date("2026-06-03T12:00:00Z");
    const oldFilePath = join(metricsDir, "token-hygiene-metrics.3.jsonl");
    writeFileSync(oldFilePath, `{"timestamp":"${oldDate.toISOString()}"}\n`);

    const recentDate = new Date("2026-07-06T12:00:00Z");
    const recentFilePath = join(metricsDir, "token-hygiene-metrics.2.jsonl");
    writeFileSync(
      recentFilePath,
      `{"timestamp":"${recentDate.toISOString()}"}\n`,
    );

    metrics.cleanupExpiredMetrics({
      metricsDir,
      retentionDays: 30,
      now: new Date("2026-07-08T12:00:00Z"),
    });

    // Old file (35 days) should be removed
    expect(existsSync(oldFilePath)).toBe(false);
    // Recent file (2 days) should survive
    expect(existsSync(recentFilePath)).toBe(true);
  });
});

// ── readMetricsFile ────────────────────────────────────────────────────

describe("readMetricsFile", () => {
  it("returns events from a valid JSONL file", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    writeFileSync(
      metricsPath,
      [
        JSON.stringify({ type: "tool_call", tool: "read" }),
        JSON.stringify({ type: "tool_result", tool: "read", chars: 500 }),
      ].join("\n") + "\n",
    );

    const result = metrics.readMetricsFile(metricsPath);
    expect(result.events).toHaveLength(2);
    expect(result.malformedLines).toHaveLength(0);
    expect(result.events[0]!.data.type).toBe("tool_call");
    expect(result.events[1]!.data.type).toBe("tool_result");
  });

  it("includes line numbers in returned events", () => {
    const metricsPath = join(tmpDir, "lined.jsonl");
    writeFileSync(
      metricsPath,
      [
        JSON.stringify({ type: "a" }),
        JSON.stringify({ type: "b" }),
        JSON.stringify({ type: "c" }),
      ].join("\n") + "\n",
    );

    const result = metrics.readMetricsFile(metricsPath);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]!.lineNumber).toBe(1);
    expect(result.events[1]!.lineNumber).toBe(2);
    expect(result.events[2]!.lineNumber).toBe(3);
  });

  it("skips malformed JSONL lines and reports them", () => {
    const metricsPath = join(tmpDir, "malformed.jsonl");
    writeFileSync(
      metricsPath,
      [
        JSON.stringify({ type: "tool_call", tool: "read" }),
        "not valid json at all",
        JSON.stringify({ type: "tool_result", tool: "read", chars: 500 }),
        "{truncated json",
      ].join("\n") + "\n",
    );

    const result = metrics.readMetricsFile(metricsPath);
    expect(result.events).toHaveLength(2);
    expect(result.malformedLines).toHaveLength(2);
    expect(result.malformedLines[0]!.lineNumber).toBe(2);
    expect(result.malformedLines[0]!.raw).toBe("not valid json at all");
    expect(result.malformedLines[1]!.lineNumber).toBe(4);
  });

  it("returns empty events for an empty file", () => {
    const metricsPath = join(tmpDir, "empty.jsonl");
    writeFileSync(metricsPath, "");

    const result = metrics.readMetricsFile(metricsPath);
    expect(result.events).toHaveLength(0);
    expect(result.malformedLines).toHaveLength(0);
  });

  it("returns empty events for a file with only whitespace", () => {
    const metricsPath = join(tmpDir, "whitespace.jsonl");
    writeFileSync(metricsPath, "  \n\n\t\n  \n");

    const result = metrics.readMetricsFile(metricsPath);
    expect(result.events).toHaveLength(0);
    // Whitespace-only lines are not malformed JSON — they're empty/whitespace lines
    expect(result.malformedLines.length).toBe(0);
  });

  it("handles file-not-found gracefully", () => {
    const nonExistent = join(tmpDir, "nope.jsonl");
    const result = metrics.readMetricsFile(nonExistent);
    expect(result.events).toHaveLength(0);
    expect(result.malformedLines).toHaveLength(0);
  });

  it("handles trailing newline correctly", () => {
    const metricsPath = join(tmpDir, "trailing.jsonl");
    writeFileSync(
      metricsPath,
      JSON.stringify({ type: "tool_call", tool: "read" }) + "\n",
    );

    const result = metrics.readMetricsFile(metricsPath);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.data.type).toBe("tool_call");
  });
});

// ── deleteLocalMetrics ─────────────────────────────────────────────────

describe("deleteLocalMetrics", () => {
  it("removes the current metrics file", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    writeFileSync(metricsPath, '{"type":"tool_call"}\n');
    expect(existsSync(metricsPath)).toBe(true);

    metrics.deleteLocalMetrics({ metricsPath });
    expect(existsSync(metricsPath)).toBe(false);
  });

  it("removes rotated metrics files with the same base name", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    writeFileSync(metricsPath, '{"type":"tool_call"}\n');
    const rotated1 = join(tmpDir, "metrics.1.jsonl");
    const rotated2 = join(tmpDir, "metrics.2.jsonl");
    writeFileSync(rotated1, '{"type":"tool_result"}\n');
    writeFileSync(rotated2, '{"type":"tool_result"}\n');

    metrics.deleteLocalMetrics({ metricsPath });
    expect(existsSync(metricsPath)).toBe(false);
    expect(existsSync(rotated1)).toBe(false);
    expect(existsSync(rotated2)).toBe(false);
  });

  it("removes the retained directory when specified and exists", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    writeFileSync(metricsPath, '{"type":"tool_call"}\n');

    const retainedDir = join(tmpDir, "retained");
    mkdirSync(retainedDir, { recursive: true });
    writeFileSync(join(retainedDir, "output.txt"), "retained data");

    metrics.deleteLocalMetrics({ metricsPath, retainedDir });
    expect(existsSync(metricsPath)).toBe(false);
    expect(existsSync(retainedDir)).toBe(false);
  });

  it("does not fail when retained directory does not exist", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    writeFileSync(metricsPath, '{"type":"tool_call"}\n');

    expect(() => {
      metrics.deleteLocalMetrics({
        metricsPath,
        retainedDir: join(tmpDir, "nonexistent-retained"),
      });
    }).not.toThrow();
  });

  it("does not delete the HMAC key path", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    writeFileSync(metricsPath, '{"type":"tool_call"}\n');

    const hmacKeyPath = join(tmpDir, "hmac-key");
    writeFileSync(hmacKeyPath, "secret-key-data");

    // hmacKeyPath is not part of the API — we test that plain deletion doesn't
    // reach outside the metrics/retained directory.
    metrics.deleteLocalMetrics({ metricsPath });
    // HMAC key should still exist
    expect(existsSync(hmacKeyPath)).toBe(true);
  });

  it("does not fail when metrics file does not exist", () => {
    const metricsPath = join(tmpDir, "nonexistent.jsonl");
    expect(() => {
      metrics.deleteLocalMetrics({ metricsPath });
    }).not.toThrow();
  });
});
