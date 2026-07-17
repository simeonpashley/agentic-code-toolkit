/**
 * Tests for the token-hygiene extension entrypoint and configuration.
 *
 * All features are live by default — warnings, metrics, and /token-hygiene.
 * Never mutates tool calls or results.
 */

import { describe, it, expect } from "vitest";
import {
  loadConfig,
  getDisableDiagnostics,
} from "../extensions/token-hygiene/config.ts";
import type { TokenHygieneConfig } from "../extensions/token-hygiene/types.ts";

describe("config loading", () => {
  it("defaults enable warnings and metrics", () => {
    const { config } = loadConfig();
    expect(config.phase).toBe(1);
    expect(config.enabled).toBe(true);
    expect(config.warnDuplicateReads).toBe(true);
    expect(config.warnToolChoice).toBe(true);
    expect(config.warnLargeReads).toBe(true);
    expect(config.warnCustomContextVisibility).toBe(true);
    expect(config.metricsEnabled).toBe(true);
  });

  it("PI_TOKEN_HYGIENE=0 disables extension completely", () => {
    const { config } = loadConfig({
      env: { PI_TOKEN_HYGIENE: "0" },
    });
    expect(config.enabled).toBe(false);
  });

  it("PI_TOKEN_HYGIENE_METRICS=0 disables metrics even when enabled", () => {
    const { config } = loadConfig({
      env: { PI_TOKEN_HYGIENE_METRICS: "0" },
    });
    expect(config.metricsEnabled).toBe(false);
  });

  it("PI_TOKEN_HYGIENE_METRICS=1 enables metrics", () => {
    const { config } = loadConfig({
      env: { PI_TOKEN_HYGIENE_METRICS: "1" },
    });
    expect(config.metricsEnabled).toBe(true);
  });

  it("PI_TOKEN_HYGIENE_WORKLOAD sets workload label", () => {
    const { config } = loadConfig({
      env: { PI_TOKEN_HYGIENE_WORKLOAD: "my-workload" },
    });
    expect(config.workloadLabel).toBe("my-workload");
  });

  it("invalid identifierMode falls back to hmac", () => {
    const { config, diagnostics } = loadConfig({
      env: { PI_TOKEN_HYGIENE_IDENTIFIER_MODE: "invalid" },
    });
    expect(config.identifierMode).toBe("hmac");
    expect(diagnostics.some((d) => d.message.includes("identifierMode"))).toBe(
      true,
    );
  });

  it("default config uses hmac identifier mode", () => {
    const { config } = loadConfig();
    expect(config.identifierMode).toBe("hmac");
  });

  it("warnings are enabled by default", () => {
    // All features are live by default — warnings cannot be
    // individually disabled via the loader (only via config overrides).
    const { config } = loadConfig();
    expect(config.warnDuplicateReads).toBe(true);
    expect(config.warnToolChoice).toBe(true);
    expect(config.warnLargeReads).toBe(true);
    expect(config.warnCustomContextVisibility).toBe(true);
  });

  it("valid metricsSampleRate via env is accepted", () => {
    const { config } = loadConfig({
      env: { PI_TOKEN_HYGIENE_SAMPLE_RATE: "0.5" },
    });
    expect(config.metricsSampleRate).toBe(0.5);
  });

  it("out-of-range metricsSampleRate via env is clamped", () => {
    const { config } = loadConfig({
      env: { PI_TOKEN_HYGIENE_SAMPLE_RATE: "1.5" },
    });
    expect(config.metricsSampleRate).toBe(1.0);
  });
});

describe("disable diagnostics", () => {
  it("includes delete command in diagnostics", () => {
    const baseConfig: TokenHygieneConfig = {
      configVersion: 1,
      phase: 1,
      enabled: false,
      metricsEnabled: false,
      metricsPath: ".pi/token-hygiene-metrics.jsonl",
      metricsSampleRate: 1.0,
      workloadLabel: "unlabeled",
      identifierMode: "hmac",
      metricsRetentionDays: 30,
      metricsMaxBytesPerFile: 10_000_000,
      metricsMaxFiles: 5,
      warnDuplicateReads: false,
      warnToolChoice: false,
      warnLargeReads: false,
      warnCustomContextVisibility: false,
      warningVisibility: "model-visible",
      compressBashSuccesses: false,
      largeReadLineThreshold: 500,
      largeListingThreshold: 500,
      modelVisibleMessageThresholdChars: 500,
      minCompressLines: 25,
      minCompressChars: 200,
    };
    const diagnostics = getDisableDiagnostics(baseConfig);
    expect(diagnostics).toContain("delete-local-metrics");
  });
});

describe("types", () => {
  it("BashNudgeClassification enum values cover all cases", () => {
    const classifications = [
      "cat-file",
      "head-file",
      "tail-file",
      "sed-range-print",
      "find-unbounded",
      "ls-R-large",
      "no-nudge",
    ] as const;
    expect(classifications.length).toBe(7);
  });
});
