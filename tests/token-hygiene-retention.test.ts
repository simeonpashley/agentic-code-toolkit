import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  retainToolOutput,
  sweepRetainedFiles,
  ensureRetentionDir,
  maybeRetainToolResult,
} from "../extensions/token-hygiene/retention";
import type { TokenHygieneConfig } from "../extensions/token-hygiene/types";

const tmpCwd = join(__dirname, "__retention_tmp__");
const defaultConfig: TokenHygieneConfig = {
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
  retainOutputThreshold: 100, // low threshold for testing
} as TokenHygieneConfig;

describe("retention", () => {
  beforeEach(() => {
    mkdirSync(tmpCwd, { recursive: true });
    sweepRetainedFiles(tmpCwd);
  });

  afterEach(() => {
    try {
      rmSync(tmpCwd, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  it("retains output exceeding threshold", () => {
    const bigContent = "x".repeat(200);
    const event = {
      toolName: "read",
      toolCallId: "call-001",
      content: [{ type: "text", text: bigContent }],
      isError: false,
    };
    const result = maybeRetainToolResult(event, defaultConfig, tmpCwd);
    expect(result).toBeDefined();
    expect(result!.content[0].text).toContain("[Output retained to");
    expect(result!._retained).toBe(true);

    // File should exist and contain original content
    const filePath = (result!.content[0].text as string).match(
      /\[Output retained to (.*)\]/,
    )?.[1];
    expect(filePath).toBeDefined();
    expect(existsSync(filePath!)).toBe(true);
    expect(readFileSync(filePath!, "utf-8")).toBe(bigContent);
  });

  it("passes through output at or below threshold", () => {
    const smallContent = "x".repeat(50); // below 100 threshold
    const event = {
      toolName: "read",
      toolCallId: "call-002",
      content: [{ type: "text", text: smallContent }],
      isError: false,
    };
    const result = maybeRetainToolResult(event, defaultConfig, tmpCwd);
    expect(result).toBeUndefined();
  });

  it("never retains error output regardless of size", () => {
    const bigErrorContent = "x".repeat(200);
    const event = {
      toolName: "bash",
      toolCallId: "call-003",
      content: [{ type: "text", text: bigErrorContent }],
      isError: true,
    };
    const result = maybeRetainToolResult(event, defaultConfig, tmpCwd);
    expect(result).toBeUndefined();
  });

  it("sanitizes toolName with special characters to prevent path traversal", () => {
    const content = "x".repeat(200);
    const event = {
      toolName: "../../../etc/passwd",
      toolCallId: "malicious-id",
      content: [{ type: "text", text: content }],
      isError: false,
    };
    const result = maybeRetainToolResult(event, defaultConfig, tmpCwd);
    expect(result).toBeDefined();
    const filePath = (result!.content[0].text as string).match(
      /\[Output retained to (.*)\]/,
    )?.[1];
    expect(filePath).toBeDefined();
    // Path should not contain directory traversal
    expect(filePath).not.toContain("..");
    expect(filePath).not.toContain("/etc/");
    // Should be under the retention directory
    expect(filePath).toContain("token-hygiene-retained");
  });

  it("handles non-text content (passes through)", () => {
    const event = {
      toolName: "read",
      toolCallId: "call-004",
      content: [{ type: "image", data: "base64..." }],
      isError: false,
    };
    const result = maybeRetainToolResult(event, defaultConfig, tmpCwd);
    expect(result).toBeUndefined();
  });

  it("handles empty content array (passes through)", () => {
    const event = {
      toolName: "read",
      toolCallId: "call-005",
      content: [],
      isError: false,
    };
    const result = maybeRetainToolResult(event, defaultConfig, tmpCwd);
    expect(result).toBeUndefined();
  });

  it("respects per-tool threshold override", () => {
    const content = "x".repeat(80); // below default 100, above read-specific 50
    const config = {
      ...defaultConfig,
      retainOutputPerToolThresholds: { read: 50 },
    };
    const event = {
      toolName: "read",
      toolCallId: "call-006",
      content: [{ type: "text", text: content }],
      isError: false,
    };
    const result = maybeRetainToolResult(event, config, tmpCwd);
    expect(result).toBeDefined();
    expect(result!._retained).toBe(true);
  });

  it("sweepRetainedFiles removes retained directory", () => {
    const dir = ensureRetentionDir(tmpCwd);
    writeFileSync(join(dir, "test.txt"), "content", "utf-8");
    expect(existsSync(join(dir, "test.txt"))).toBe(true);
    sweepRetainedFiles(tmpCwd);
    expect(existsSync(dir)).toBe(false);
  });

  it("sweepRetainedFiles handles nonexistent directory gracefully", () => {
    expect(() => sweepRetainedFiles(tmpCwd)).not.toThrow();
  });

  it("file permissions are 0600 (POSIX)", () => {
    if (process.platform === "win32") return; // skip on Windows
    const content = "x".repeat(200);
    const filePath = retainToolOutput("read", "call-007", content, tmpCwd);
    expect(filePath).toBeDefined();
    const mode = statSync(filePath!).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
