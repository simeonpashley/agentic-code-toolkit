/**
 * Tests for the top-tool-results processor.
 *
 * This processor reads metrics JSONL and returns the top N tools
 * by estimated total result tokens, sorted descending.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { computeTopToolResults } from "../scripts/token-hygiene/processors/top-tool-results.ts";

const fixtureFile = resolve(
  __dirname,
  "token-hygiene-fixtures/tool-results.jsonl",
);

describe("top-tool-results processor", () => {
  it("returns tools sorted by total estimated tokens descending", () => {
    const fixture = readFileSync(fixtureFile, "utf-8");
    const result = computeTopToolResults(fixture);

    // bash calls: call-3 (3000) + call-5 (7500) + call-7 (375) = 10875
    // read calls: call-1 (625) + call-4 (1250) = 1875
    // grep calls: call-2 (2000)
    // webfetch calls: call-6 (125)
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(
      expect.objectContaining({
        toolName: "bash",
        totalTokens: 10875,
        totalCalls: 3,
        errorCalls: 0,
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        toolName: "grep",
        totalTokens: 2000,
        totalCalls: 1,
        errorCalls: 0,
      }),
    );
    expect(result[2]).toEqual(
      expect.objectContaining({
        toolName: "read",
        totalTokens: 1875,
        totalCalls: 2,
        errorCalls: 0,
      }),
    );
    expect(result[3]).toEqual(
      expect.objectContaining({
        toolName: "webfetch",
        totalTokens: 125,
        totalCalls: 1,
        errorCalls: 1,
      }),
    );
  });

  it("respects the topN parameter", () => {
    const fixture = readFileSync(fixtureFile, "utf-8");
    const result = computeTopToolResults(fixture, 2);
    expect(result).toHaveLength(2);
    expect(result[0].toolName).toBe("bash");
    expect(result[1].toolName).toBe("grep");
  });

  it("returns empty array for empty input", () => {
    const result = computeTopToolResults("");
    expect(result).toEqual([]);
  });

  it("returns empty array for input with no tool_result events", () => {
    const input = [
      JSON.stringify({
        event: "session_start",
        timestamp: "2026-07-07T10:00:00.000Z",
        sessionId: "abc",
      }),
      JSON.stringify({
        event: "context_snapshot",
        timestamp: "2026-07-07T10:00:15.000Z",
        estimatedContextTokens: 10000,
      }),
    ].join("\n");
    const result = computeTopToolResults(input);
    expect(result).toEqual([]);
  });

  it("skips malformed JSON lines gracefully", () => {
    const input = [
      `{"event":"tool_result","timestamp":"2026-07-07T10:00:02.000Z","toolName":"read","callId":"call-1","isError":false,"modelVisibleChars":2500,"estimatedTokens":625}`,
      `not valid json`,
      `{"event":"tool_result","timestamp":"2026-07-07T10:00:06.000Z","toolName":"bash","callId":"call-3","isError":false,"modelVisibleChars":12000,"estimatedTokens":3000}`,
    ].join("\n");
    const result = computeTopToolResults(input);
    expect(result).toHaveLength(2);
    expect(result[0].toolName).toBe("bash");
    expect(result[0].totalTokens).toBe(3000);
    expect(result[1].toolName).toBe("read");
    expect(result[1].totalTokens).toBe(625);
  });

  it("counts calls with missing estimatedTokens as 0 tokens", () => {
    const input = [
      JSON.stringify({
        event: "tool_result",
        toolName: "read",
        callId: "call-1",
        isError: false,
      }),
      JSON.stringify({
        event: "tool_result",
        toolName: "bash",
        callId: "call-2",
        isError: false,
        estimatedTokens: 500,
      }),
    ].join("\n");
    const result = computeTopToolResults(input);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.toolName === "read")!.totalTokens).toBe(0);
    expect(result.find((r) => r.toolName === "bash")!.totalTokens).toBe(500);
  });

  it("defaults topN to 20 when not specified", () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(
        JSON.stringify({
          event: "tool_result",
          toolName: `tool-${i}`,
          callId: `call-${i}`,
          estimatedTokens: 100,
        }),
      );
    }
    const result = computeTopToolResults(lines.join("\n"));
    expect(result).toHaveLength(20);
    expect(result[0].toolName).toBe("tool-0");
    expect(result[19].toolName).toBe("tool-19");
  });
});
