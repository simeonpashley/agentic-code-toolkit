/**
 * Tests for the /token-hygiene report builder.
 *
 * Phase 1: compact ranked action report, not a dashboard.
 * Uses context analysis; sorts buckets by descending tokens.
 * Output must say "candidate reduction" not "cheapest reduction".
 */

import { describe, it, expect } from "vitest";
import {
  buildTokenHygieneReport,
  renderTokenHygieneReport,
} from "../extensions/token-hygiene/context-report.ts";
import type {
  TokenHygieneReportInput,
  HygieneWarning,
} from "../extensions/token-hygiene/types.ts";

function makeInput(
  overrides?: Partial<TokenHygieneReportInput>,
): TokenHygieneReportInput {
  return {
    warnings: [],
    metricsAvailable: false,
    metricsPath: ".pi/token-hygiene-metrics.jsonl",
    retentionDays: 30,
    ...overrides,
  };
}

function makeWarning(overrides?: Partial<HygieneWarning>): HygieneWarning {
  return {
    kind: "duplicate-read",
    visibility: "model-visible",
    toolName: "read",
    callId: "call_1",
    message: "Warning message",
    ...overrides,
  };
}

describe("buildTokenHygieneReport", () => {
  it("returns report for empty session", () => {
    const report = buildTokenHygieneReport(makeInput());
    expect(report.totalEstimatedTokens).toBeGreaterThan(0);
    expect(report.buckets.length).toBeGreaterThan(0);
    expect(report.contextPercent).toBeGreaterThanOrEqual(0);
    expect(report.biggestAvoidableDebris).toBeTruthy();
  });

  it("sorts buckets by estimated tokens descending", () => {
    const input = makeInput({
      warnings: [
        makeWarning({ kind: "bash-nudge" }),
        makeWarning({ kind: "duplicate-read" }),
      ],
    });
    const report = buildTokenHygieneReport(input);
    for (let i = 1; i < report.buckets.length; i++) {
      expect(report.buckets[i].estimatedTokens).toBeLessThanOrEqual(
        report.buckets[i - 1].estimatedTokens,
      );
    }
  });

  it("includes recent warnings", () => {
    const input = makeInput({
      warnings: [
        makeWarning({
          kind: "duplicate-read",
          message: "Duplicate read warning",
        }),
        makeWarning({ kind: "bash-nudge", message: "Bash nudge warning" }),
      ],
    });
    const report = buildTokenHygieneReport(input);
    expect(report.recentWarnings.length).toBeGreaterThan(0);
    expect(report.recentWarnings.some((w) => w.kind === "duplicate-read")).toBe(
      true,
    );
  });

  it("reports unknown visibility when no warnings", () => {
    const report = buildTokenHygieneReport(makeInput());
    const unknownBucket = report.buckets.find(
      (b) => b.name === "Unknown visibility",
    );
    expect(unknownBucket).toBeTruthy();
  });

  it("includes startup-context tax bucket", () => {
    const report = buildTokenHygieneReport(makeInput());
    const startupBucket = report.buckets.find(
      (b) => b.name === "Startup-context tax",
    );
    expect(startupBucket).toBeTruthy();
  });

  it("includes tool-schema bucket", () => {
    const report = buildTokenHygieneReport(makeInput());
    const schemaBucket = report.buckets.find((b) => b.name === "Tool schemas");
    expect(schemaBucket).toBeTruthy();
  });

  it("includes custom context bucket when warnings present", () => {
    const input = makeInput({
      warnings: [makeWarning({ kind: "custom-context" })],
    });
    const report = buildTokenHygieneReport(input);
    const customBucket = report.buckets.find(
      (b) => b.name === "Custom context",
    );
    expect(customBucket).toBeTruthy();
  });

  it("includes bash tool results bucket when bash nudge warnings present", () => {
    const input = makeInput({
      warnings: [makeWarning({ kind: "bash-nudge" })],
    });
    const report = buildTokenHygieneReport(input);
    const bashBucket = report.buckets.find(
      (b) => b.name === "Tool results (bash test output)",
    );
    expect(bashBucket).toBeTruthy();
  });

  it("includes data controls", () => {
    const report = buildTokenHygieneReport(makeInput());
    expect(report.dataControls.metricsPath).toBeTruthy();
    expect(report.dataControls.deleteCommand).toContain("delete-local-metrics");
    expect(report.dataControls.retentionDays).toBe(30);
    expect(report.dataControls.backupCaveat).toContain("Time Machine");
  });

  it("reports metrics as not recording when metrics unavailable", () => {
    const report = buildTokenHygieneReport(
      makeInput({ metricsAvailable: false }),
    );
    expect(report.metricsStatus).toContain("Not recording");
  });

  it("reports metrics as recording when available", () => {
    const report = buildTokenHygieneReport(
      makeInput({ metricsAvailable: true }),
    );
    expect(report.metricsStatus).toContain("Recording");
  });

  it("candidate reductions use 'candidate reduction' wording", () => {
    const report = buildTokenHygieneReport(
      makeInput({ warnings: [makeWarning({ kind: "duplicate-read" })] }),
    );
    for (const r of report.candidateReductions) {
      // Should not say "cheapest"
      expect(r).not.toMatch(/cheapest/i);
    }
  });

  it("includes biggest avoidable debris action", () => {
    const report = buildTokenHygieneReport(makeInput());
    expect(report.biggestAvoidableDebris).toBeTruthy();
  });

  it("limits warnings to 5 most recent", () => {
    const warnings = Array.from({ length: 10 }, (_, i) =>
      makeWarning({
        kind: "duplicate-read",
        message: `Warning ${i}`,
        callId: `call_${i}`,
      }),
    );
    const report = buildTokenHygieneReport(makeInput({ warnings }));
    expect(report.recentWarnings.length).toBeLessThanOrEqual(5);
  });
});

describe("renderTokenHygieneReport", () => {
  it("produces markdown with heading", () => {
    const report = buildTokenHygieneReport(makeInput());
    const rendered = renderTokenHygieneReport(report);
    expect(rendered).toContain("## Token Hygiene");
  });

  it("includes context use line", () => {
    const report = buildTokenHygieneReport(makeInput());
    const rendered = renderTokenHygieneReport(report);
    expect(rendered).toContain("Context use");
    expect(rendered).toContain("%");
  });

  it("includes top contributors section", () => {
    const report = buildTokenHygieneReport(makeInput());
    const rendered = renderTokenHygieneReport(report);
    expect(rendered).toContain("Top contributors");
  });

  it("writes 'candidate reduction' not 'cheapest reduction'", () => {
    const report = buildTokenHygieneReport(makeInput());
    const rendered = renderTokenHygieneReport(report);
    expect(rendered).not.toMatch(/cheapest/i);
  });

  it("includes data controls section", () => {
    const report = buildTokenHygieneReport(makeInput());
    const rendered = renderTokenHygieneReport(report);
    expect(rendered).toContain("Data controls");
    expect(rendered).toContain("Metrics path");
    expect(rendered).toContain("delete-local-metrics");
    expect(rendered).toContain("Time Machine");
  });

  it("includes metrics status", () => {
    const report = buildTokenHygieneReport(makeInput());
    const rendered = renderTokenHygieneReport(report);
    expect(rendered).toContain("Metrics");
  });

  it("renders warnings section when warnings exist", () => {
    const input = makeInput({
      warnings: [
        makeWarning({
          kind: "duplicate-read",
          message: "Test warning message",
        }),
      ],
    });
    const report = buildTokenHygieneReport(input);
    const rendered = renderTokenHygieneReport(report);
    expect(rendered).toContain("Recent warnings");
    expect(rendered).toContain("Test warning message");
  });

  it("candidate reductions section appears when available", () => {
    const input = makeInput({
      warnings: [
        makeWarning({ kind: "duplicate-read" }),
        makeWarning({ kind: "bash-nudge" }),
      ],
    });
    const report = buildTokenHygieneReport(input);
    const rendered = renderTokenHygieneReport(report);
    expect(rendered).toContain("Candidate reductions");
  });
});
