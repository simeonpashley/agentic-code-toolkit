/**
 * Token hygiene metrics analyser tests.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md
 *
 * Covers:
 *   - analyseMetrics with all recognised event types
 *   - Malformed lines in fixture JSONL
 *   - Empty metrics file
 *   --help flag
 *   --markdown output
 *   --unsafe-include-identifiers flag handling
 *   --delete-local-metrics integration
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParsedMetricRecord } from "../extensions/token-hygiene/metrics.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fixtureRecord(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    type: "tool_call",
    toolName: "read",
    toolCallId: "call_abc123",
    timestamp: "2026-07-08T12:00:00.000Z",
    ...overrides,
  };
}

function readFixtureFile(path: string) {
  // Import dynamically to get fresh module
  const content = readFileSync(path, "utf-8");
  const events: ParsedMetricRecord[] = [];
  const malformedLines: { lineNumber: number; raw: string }[] = [];

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      events.push({ lineNumber: i + 1, data });
    } catch {
      malformedLines.push({ lineNumber: i + 1, raw });
    }
  }

  return { events, malformedLines };
}

// ── Setup ────────────────────────────────────────────────────────────────────

let tmpDir = "";
let analyser: typeof import("../scripts/token-hygiene/analyse-metrics.ts");

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "token-hygiene-analyse-"));
  analyser = await import("../scripts/token-hygiene/analyse-metrics.ts");
});

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── HELP OUTPUT ─────────────────────────────────────────────────────────────

describe("CLI --help", () => {
  it("prints help text and exits with code 0", () => {
    const result = analyser.printHelp();
    expect(result).toContain("Usage");
    expect(result).toContain("analyse-metrics");
    expect(result).toContain("--help");
    expect(result).toContain("--markdown");
    expect(result).toContain("--delete-local-metrics");
    expect(result).toContain("--unsafe-include-identifiers");
  });
});

// ─── EMPTY FILE ──────────────────────────────────────────────────────────────

describe("analyseMetrics with empty data", () => {
  it("returns zero counts for an empty events array", () => {
    const result = analyser.analyseMetrics([]);
    expect(result.totalEvents).toBe(0);
    expect(result.totalMalformedLines).toBe(0);
    expect(result.eventTypeCounts).toEqual({});
    expect(result.timestampRange).toBeNull();
    expect(result.redactionFailureCount).toBe(0);
    expect(result.totalEstimatedTokens).toBeNull();
  });
});

// ─── ALL EVENT TYPES ─────────────────────────────────────────────────────────

describe("analyseMetrics with all event types", () => {
  it("counts events by type", () => {
    const events: ParsedMetricRecord[] = [
      {
        lineNumber: 1,
        data: fixtureRecord({ type: "session_start" }),
      },
      {
        lineNumber: 2,
        data: fixtureRecord({ type: "context_snapshot", chars: 1500 }),
      },
      {
        lineNumber: 3,
        data: fixtureRecord({ type: "tool_call", toolName: "read" }),
      },
      {
        lineNumber: 4,
        data: fixtureRecord({ type: "tool_result", chars: 500 }),
      },
      {
        lineNumber: 5,
        data: fixtureRecord({ type: "read_result", chars: 300 }),
      },
      {
        lineNumber: 6,
        data: fixtureRecord({ type: "search_result", chars: 200 }),
      },
      {
        lineNumber: 7,
        data: fixtureRecord({ type: "bash_result", chars: 100 }),
      },
      {
        lineNumber: 8,
        data: fixtureRecord({ type: "warning", message: "high token usage" }),
      },
      {
        lineNumber: 9,
        data: fixtureRecord({ type: "compression_decision", chars: 50 }),
      },
      {
        lineNumber: 10,
        data: fixtureRecord({
          type: "redaction_failure",
          reason: "unknown-event",
        }),
      },
    ];

    const result = analyser.analyseMetrics(events);

    expect(result.totalEvents).toBe(10);
    expect(result.eventTypeCounts).toEqual({
      session_start: 1,
      context_snapshot: 1,
      tool_call: 1,
      tool_result: 1,
      read_result: 1,
      search_result: 1,
      bash_result: 1,
      warning: 1,
      compression_decision: 1,
      redaction_failure: 1,
    });
  });

  it("counts redaction_failures separately", () => {
    const events: ParsedMetricRecord[] = [
      { lineNumber: 1, data: fixtureRecord({ type: "tool_call" }) },
      { lineNumber: 2, data: fixtureRecord({ type: "redaction_failure" }) },
      { lineNumber: 3, data: fixtureRecord({ type: "redaction_failure" }) },
    ];

    const result = analyser.analyseMetrics(events);
    expect(result.redactionFailureCount).toBe(2);
  });

  it("computes timestamp range correctly", () => {
    const events: ParsedMetricRecord[] = [
      {
        lineNumber: 1,
        data: fixtureRecord({
          type: "tool_call",
          timestamp: "2026-07-08T10:00:00.000Z",
        }),
      },
      {
        lineNumber: 2,
        data: fixtureRecord({
          type: "tool_result",
          timestamp: "2026-07-08T11:00:00.000Z",
        }),
      },
      {
        lineNumber: 3,
        data: fixtureRecord({
          type: "context_snapshot",
          timestamp: "2026-07-08T09:00:00.000Z",
        }),
      },
    ];

    const result = analyser.analyseMetrics(events);
    expect(result.timestampRange).toEqual({
      first: "2026-07-08T09:00:00.000Z",
      last: "2026-07-08T11:00:00.000Z",
    });
  });

  it("counts tool usage from tool_call events", () => {
    const events: ParsedMetricRecord[] = [
      {
        lineNumber: 1,
        data: fixtureRecord({ type: "tool_call", toolName: "read" }),
      },
      {
        lineNumber: 2,
        data: fixtureRecord({ type: "tool_call", toolName: "read" }),
      },
      {
        lineNumber: 3,
        data: fixtureRecord({ type: "tool_call", toolName: "bash" }),
      },
      {
        lineNumber: 4,
        data: fixtureRecord({ type: "tool_call", toolName: "websearch" }),
      },
      {
        lineNumber: 5,
        data: fixtureRecord({ type: "tool_result", toolName: "read" }),
      },
    ];

    const result = analyser.analyseMetrics(events);
    expect(result.toolCallCount).toBe(4);
    expect(result.toolUsage).toEqual({
      read: 2,
      bash: 1,
      websearch: 1,
    });
  });
});

// ─── ESTIMATED TOKENS ────────────────────────────────────────────────────────

describe("analyseMetrics totalEstimatedTokens", () => {
  it("sums chars from events that have the field", () => {
    const events: ParsedMetricRecord[] = [
      {
        lineNumber: 1,
        data: fixtureRecord({ type: "tool_result", chars: 1000 }),
      },
      {
        lineNumber: 2,
        data: fixtureRecord({ type: "tool_result", chars: 2000 }),
      },
      { lineNumber: 3, data: fixtureRecord({ type: "tool_call" }) }, // no chars field
    ];

    const result = analyser.analyseMetrics(events);
    expect(result.totalEstimatedTokens).toBe(3000);
  });

  it("returns null when no events have chars", () => {
    const events: ParsedMetricRecord[] = [
      { lineNumber: 1, data: fixtureRecord({ type: "tool_call" }) },
      { lineNumber: 2, data: fixtureRecord({ type: "session_start" }) },
    ];

    const result = analyser.analyseMetrics(events);
    expect(result.totalEstimatedTokens).toBeNull();
  });
});

// ─── MALFORMED LINES ─────────────────────────────────────────────────────────

describe("analyseMetrics with malformed lines", () => {
  it("accepts malformed lines from outside the reader", () => {
    const events: ParsedMetricRecord[] = [
      { lineNumber: 1, data: fixtureRecord({ type: "tool_call" }) },
    ];
    const malformed = [{ lineNumber: 2, raw: "not valid json" }];

    const result = analyser.analyseMetrics(events, {
      malformedLines: malformed,
    });
    expect(result.totalEvents).toBe(1);
    expect(result.totalMalformedLines).toBe(1);
  });
});

// ─── MARKDOWN OUTPUT ─────────────────────────────────────────────────────────

describe("formatMarkdown", () => {
  it("produces a markdown table from an AnalyseResult", () => {
    const result: analyser.AnalyseResult = {
      totalEvents: 10,
      totalMalformedLines: 1,
      redactionFailureCount: 2,
      totalEstimatedTokens: 5000,
      toolCallCount: 4,
      timestampRange: {
        first: "2026-07-08T09:00:00.000Z",
        last: "2026-07-08T11:00:00.000Z",
      },
      eventTypeCounts: {
        tool_call: 4,
        tool_result: 3,
        context_snapshot: 1,
        redaction_failure: 2,
      },
      toolUsage: {
        read: 2,
        bash: 1,
        websearch: 1,
      },
    };

    const md = analyser.formatMarkdown(result);

    // Should have a metrics summary section
    expect(md).toContain("Token Hygiene Metrics Analysis");
    expect(md).toContain("10"); // total events
    expect(md).toContain("tool_call"); // event type
    expect(md).toContain("4"); // tool_call count
    expect(md).toContain("read"); // tool name
    expect(md).toContain("2"); // redaction_failure count
    expect(md).toContain("5000"); // estimated tokens
  });
});

// ─── DELETE LOCAL METRICS ────────────────────────────────────────────────────

describe("deleteLocalMetricsAfterAnalysis", () => {
  it("deletes the metrics file and returns true on success", () => {
    const metricsPath = join(tmpDir, "metrics.jsonl");
    writeFileSync(metricsPath, JSON.stringify(fixtureRecord()) + "\n");
    expect(existsSync(metricsPath)).toBe(true);

    const result = analyser.deleteMetricsFile(metricsPath);
    expect(result).toBe(true);
    expect(existsSync(metricsPath)).toBe(false);
  });

  it("returns false for a non-existent file", () => {
    const result = analyser.deleteMetricsFile(
      join(tmpDir, "nonexistent.jsonl"),
    );
    expect(result).toBe(false);
  });
});

// ─── UNSAFE INCLUDE IDENTIFIERS ──────────────────────────────────────────────

describe("analyseMetrics with unsafe identifiers", () => {
  it("collects path and pattern fields when includeIdentifiers is true", () => {
    const events: ParsedMetricRecord[] = [
      {
        lineNumber: 1,
        data: {
          type: "tool_call",
          toolName: "read",
          input: { path: "/etc/config.json", query: "config" },
          timestamp: "2026-07-08T12:00:00.000Z",
        },
      },
      {
        lineNumber: 2,
        data: {
          type: "tool_call",
          toolName: "bash",
          input: { url: "https://example.com" },
          timestamp: "2026-07-08T12:00:00.000Z",
        },
      },
    ];

    const result = analyser.analyseMetrics(events, {
      includeIdentifiers: true,
    });

    expect(result.identifiers).toBeDefined();
    expect(result.identifiers!.length).toBeGreaterThan(0);
    expect(
      result.identifiers!.some((id) => id.includes("/etc/config.json")),
    ).toBe(true);
    expect(result.identifiers!.some((id) => id.includes("config"))).toBe(true);
  });

  it("does not include identifiers by default", () => {
    const events: ParsedMetricRecord[] = [
      {
        lineNumber: 1,
        data: {
          type: "tool_call",
          toolName: "read",
          input: { path: "/etc/config.json" },
          timestamp: "2026-07-08T12:00:00.000Z",
        },
      },
    ];

    const result = analyser.analyseMetrics(events);
    expect(result.identifiers).toBeUndefined();
  });
});

// ─── INTEGRATION: parse JSONL file ──────────────────────────────────────────

describe("analyseMetrics with actual JSONL fixture file", () => {
  it("reads and analyses a complete fixture file", () => {
    const fixtureLines = [
      JSON.stringify(fixtureRecord({ type: "session_start" })),
      JSON.stringify(fixtureRecord({ type: "context_snapshot", chars: 1000 })),
      JSON.stringify(fixtureRecord({ type: "tool_call", toolName: "read" })),
      JSON.stringify(fixtureRecord({ type: "tool_call", toolName: "bash" })),
      JSON.stringify(fixtureRecord({ type: "tool_result", chars: 2500 })),
      JSON.stringify(fixtureRecord({ type: "tool_result", chars: 1500 })),
      JSON.stringify(
        fixtureRecord({ type: "redaction_failure", reason: "unknown" }),
      ),
      JSON.stringify(fixtureRecord({ type: "warning", message: "high usage" })),
      "this is not valid json",
    ];

    const fixturePath = join(tmpDir, "fixture.jsonl");
    writeFileSync(fixturePath, fixtureLines.join("\n") + "\n");

    const { events, malformedLines } = readFixtureFile(fixturePath);
    const result = analyser.analyseMetrics(events, { malformedLines });

    expect(result.totalEvents).toBe(8);
    expect(result.totalMalformedLines).toBe(1);
    expect(result.totalEstimatedTokens).toBe(5000);
    expect(result.redactionFailureCount).toBe(1);
    expect(result.eventTypeCounts).toEqual({
      session_start: 1,
      context_snapshot: 1,
      tool_call: 2,
      tool_result: 2,
      redaction_failure: 1,
      warning: 1,
    });
    expect(result.toolUsage).toEqual({
      read: 1,
      bash: 1,
    });
    expect(result.toolCallCount).toBe(2);
  });
});
