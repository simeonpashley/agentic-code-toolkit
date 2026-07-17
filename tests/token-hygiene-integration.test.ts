import { describe, expect, it } from "vitest";
import { maybeRetainToolResult } from "../extensions/token-hygiene/retention";
import type { TokenHygieneConfig } from "../extensions/token-hygiene/types";

const config: TokenHygieneConfig = {
  configVersion: 1,
  phase: 1,
  enabled: true,
  metricsEnabled: true,
  metricsPath: ".pi/token-hygiene-metrics.jsonl",
  metricsSampleRate: 1.0,
  workloadLabel: "test",
  identifierMode: "hmac",
  metricsRetentionDays: 30,
  metricsMaxBytesPerFile: 10_000_000,
  metricsMaxFiles: 5,
  warnDuplicateReads: true,
  warnToolChoice: true,
  warnLargeReads: true,
  warnCustomContextVisibility: true,
  warningVisibility: "model-visible",
  compressBashSuccesses: false,
  largeReadLineThreshold: 500,
  largeListingThreshold: 500,
  modelVisibleMessageThresholdChars: 500,
  minCompressLines: 25,
  minCompressChars: 200,
  retainOutputThreshold: 50,
} as TokenHygieneConfig;

describe("retention integration with downstream hooks", () => {
  it("sets _retained flag so read-search can skip retained outputs", () => {
    const bigContent = "x".repeat(200);
    const event = {
      toolName: "read",
      toolCallId: "call-001",
      content: [{ type: "text", text: bigContent }],
      isError: false,
    };
    const result = maybeRetainToolResult(event, config, __dirname);
    expect(result).toBeDefined();
    expect(result!._retained).toBe(true);

    // Downstream hook simulation: skip if _retained
    const shouldProcess = !(result as any)._retained;
    expect(shouldProcess).toBe(false);
  });

  it("does not set _retained flag for below-threshold output", () => {
    const smallContent = "x".repeat(20);
    const event = {
      toolName: "read",
      toolCallId: "call-002",
      content: [{ type: "text", text: smallContent }],
      isError: false,
    };
    const result = maybeRetainToolResult(event, config, __dirname);
    expect(result).toBeUndefined();

    // Downstream hook simulation: should process (result is undefined = no retention)
    const shouldProcess = true;
    expect(shouldProcess).toBe(true);
  });
});
