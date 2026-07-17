import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  statSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { SensitiveClassification } from "../extensions/token-hygiene/types";
import {
  compressBashOutput,
  cleanupRetainedOutputs,
  type RetainOutputResult,
} from "../extensions/token-hygiene/bash-compressors";

// ── Helpers ────────────────────────────────────────────────────────────────

const notSensitive: (_output: string) => SensitiveClassification = () =>
  "not-sensitive";
const alwaysSensitive: (_output: string) => SensitiveClassification = () =>
  "sensitive";
const alwaysUnknown: (_output: string) => SensitiveClassification = () =>
  "unknown";

const MIN_LINES = 25;
const MIN_CHARS = 200;
const SESSION_START_MS = Date.now();

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "th-compressors-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── compressBashOutput: basic contract ────────────────────────────────────

describe("compressBashOutput", () => {
  // ── eligible families produce summary with retainedOutputId ────────────

  it("returns summary with retainedOutputId for eligible git-status output", () => {
    const output = [
      "On branch main",
      "Changes not staged for commit:",
      "  modified:   src/index.ts",
      "  modified:   src/utils.ts",
      "",
      "Untracked files:",
      "  new-file.ts",
    ].join("\n");

    const result = compressBashOutput({
      command: "git status --short",
      commandFamily: "git-status",
      output,
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result).toHaveProperty("kind", "summary");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("retainedOutputId");
    expect(typeof result.summary).toBe("string");
    expect(result.summary).toBeTruthy();
    expect(typeof result.retainedOutputId).toBe("string");
    expect(result.retainedOutputId).toBeTruthy();
  });

  it("returns summary with retainedOutputId for eligible git-log output", () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`commit abc${String(i).padStart(5, "0")}1234`);
      lines.push(`Author: Test User <test@example.com>`);
      lines.push(`Date:   Mon Jan 1 00:00:00 2024 +0000`);
      lines.push(`    Commit message ${i}`);
      lines.push("");
    }
    const output = lines.join("\n");

    const result = compressBashOutput({
      command: "git log --oneline -30",
      commandFamily: "git-log",
      output,
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("summary");
    expect(result.summary).toBeTruthy();
    expect(result.retainedOutputId).toBeTruthy();
  });

  it("returns summary with retainedOutputId for eligible passing-tests output", () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`  ✓ test case ${i} passed (2ms)`);
    }
    lines.push("");
    lines.push(" Test Files  5 passed (5)");
    lines.push("      Tests  142 passed (142)");
    const output = lines.join("\n");

    const result = compressBashOutput({
      command: "pnpm test",
      commandFamily: "passing-tests",
      output,
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("summary");
    expect(result.summary).toContain("142");
    expect(result.retainedOutputId).toBeTruthy();
  });

  it("returns summary with retainedOutputId for eligible successful-builds output", () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`[${i}/30] Building step ${i}...`);
    }
    lines.push("✓ Build completed successfully in 42.5s");
    const output = lines.join("\n");

    const result = compressBashOutput({
      command: "pnpm build",
      commandFamily: "successful-builds",
      output,
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("summary");
    expect(result.summary).toBeTruthy();
    expect(result.retainedOutputId).toBeTruthy();
  });

  it("returns summary with retainedOutputId for eligible package-install output", () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`+ package-${i}@1.0.0`);
    }
    lines.push("✔ Packages installed (15.2s)");
    const output = lines.join("\n");

    const result = compressBashOutput({
      command: "npm install",
      commandFamily: "package-install",
      output,
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("summary");
    expect(result.summary).toBeTruthy();
    expect(result.retainedOutputId).toBeTruthy();
  });

  it("returns summary with retainedOutputId for eligible large-listing output", () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`-rw-r--r--  1 user  staff   1234 Jan  1 00:00 file-${i}.ts`);
    }
    const output = lines.join("\n");

    const result = compressBashOutput({
      command: "ls -la",
      commandFamily: "large-listing",
      output,
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("summary");
    expect(result.summary).toBeTruthy();
    expect(result.retainedOutputId).toBeTruthy();
  });

  // ── ineligible → pass-through ─────────────────────────────────────────

  it("returns pass-through for non-zero exit", () => {
    const result = compressBashOutput({
      command: "git status",
      commandFamily: "git-status",
      output: "fatal: not a git repository",
      exitCode: 128,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("pass-through");
    expect(result.summary).toBeUndefined();
    expect(result.retainedOutputId).toBeUndefined();
  });

  it("returns pass-through for diff commands (never-compress)", () => {
    const result = compressBashOutput({
      command: "git diff",
      commandFamily: "git-status",
      output:
        "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,4 @@\n+new line",
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("pass-through");
  });

  it("returns pass-through for curl commands (never-compress)", () => {
    const result = compressBashOutput({
      command: "curl https://api.example.com/data",
      commandFamily: "unknown",
      output: "response data here",
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("pass-through");
  });

  it("returns pass-through for verbose commands (never-compress)", () => {
    const result = compressBashOutput({
      command: "some-tool --verbose",
      commandFamily: "unknown",
      output: "verbose output here",
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("pass-through");
  });

  it("returns pass-through for stack traces in output", () => {
    const output = [
      "Error: Something went wrong",
      "  at Object.<anonymous> (src/index.ts:42:5)",
      "  at Module._compile (node:internal/modules/cjs/loader:1256:14)",
      "  at Object.executeUserEntryPoint (node:internal/modules/run_main:81:12)",
      "    at async main (src/cli.ts:10:3)",
      "    at async run (src/cli.ts:25:5)",
    ].join("\n");

    const result = compressBashOutput({
      command: "node script.js",
      commandFamily: "unknown",
      output,
      exitCode: 1,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("pass-through");
  });

  it("returns pass-through when compressBashSuccesses is disabled", () => {
    const result = compressBashOutput({
      command: "git status",
      commandFamily: "git-status",
      output: "some output here",
      exitCode: 0,
      env: {},
      compressBashSuccesses: false,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("pass-through");
  });

  it("returns pass-through for unknown families", () => {
    const result = compressBashOutput({
      command: "some-unknown-command",
      commandFamily: null,
      output: "some output",
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("pass-through");
  });

  it("returns pass-through for below-threshold output", () => {
    const result = compressBashOutput({
      command: "git status",
      commandFamily: "git-status",
      output: "short",
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 100,
      minCompressChars: 1000,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: notSensitive,
    });

    expect(result.kind).toBe("pass-through");
  });

  // ── sensitive/unknown outputs ─────────────────────────────────────────

  it("never retains sensitive output — returns pass-through", () => {
    const result = compressBashOutput({
      command: "git status",
      commandFamily: "git-status",
      output: "sensitive data: api_key=sk-abc123",
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: alwaysSensitive,
    });

    expect(result.kind).toBe("pass-through");
  });

  it("never retains unknown-classified output — returns pass-through", () => {
    const result = compressBashOutput({
      command: "git status",
      commandFamily: "git-status",
      output: "ambiguous output",
      exitCode: 0,
      env: {},
      compressBashSuccesses: true,
      minCompressLines: 1,
      minCompressChars: 1,
      retainedOutputDir: tmpDir,
      sessionStartMs: SESSION_START_MS,
      classifyOutput: alwaysUnknown,
    });

    expect(result.kind).toBe("pass-through");
  });
});

// ── retainOutput: security guarantees ──────────────────────────────────────

describe("retained output lifecycle", () => {
  describe("retainOutput", () => {
    it("creates retained output dir with 0700 permissions (or narrower)", () => {
      // Pre-create a sub-dir so retainOutput uses it
      const retainedDir = join(tmpDir, "retained-output");
      mkdirSync(retainedDir, { recursive: true, mode: 0o700 });

      // Now call compressBashOutput which will create the file inside retainedDir
      const output = Array.from({ length: 30 }, (_, i) => `line ${i}`).join(
        "\n",
      );

      const result = compressBashOutput({
        command: "git status",
        commandFamily: "git-status",
        output,
        exitCode: 0,
        env: {},
        compressBashSuccesses: true,
        minCompressLines: 1,
        minCompressChars: 1,
        retainedOutputDir: retainedDir,
        sessionStartMs: SESSION_START_MS,
        classifyOutput: notSensitive,
      });

      expect(result.kind).toBe("summary");
      expect(result.retainedOutputId).toBeTruthy();

      // Check the retained file exists
      const filePath = join(retainedDir, result.retainedOutputId!);
      expect(existsSync(filePath)).toBe(true);

      // Check retained output dir has 0700 permissions
      const dirStats = statSync(retainedDir);
      // 0700 = owner read+write+execute; mask to get just permission bits
      const dirMode = dirStats.mode & 0o777;
      expect(dirMode).toBeLessThanOrEqual(0o700);
    });

    it("creates retained output files with 0600 permissions (or narrower)", () => {
      const retainedDir = join(tmpDir, "retained-output-files");

      const output = Array.from({ length: 30 }, (_, i) => `line ${i}`).join(
        "\n",
      );

      const result = compressBashOutput({
        command: "git status",
        commandFamily: "git-status",
        output,
        exitCode: 0,
        env: {},
        compressBashSuccesses: true,
        minCompressLines: 1,
        minCompressChars: 1,
        retainedOutputDir: retainedDir,
        sessionStartMs: SESSION_START_MS,
        classifyOutput: notSensitive,
      });

      expect(result.kind).toBe("summary");
      expect(result.retainedOutputId).toBeTruthy();

      const filePath = join(retainedDir, result.retainedOutputId!);
      const fileStats = statSync(filePath);
      const fileMode = fileStats.mode & 0o777;
      expect(fileMode).toBeLessThanOrEqual(0o600);
    });

    it("uses opaque IDs for retained files (not sequential/guessable)", () => {
      const retainedDir = join(tmpDir, "retained-opaque");

      const output = Array.from({ length: 30 }, (_, i) => `line ${i}`).join(
        "\n",
      );

      const results = new Set<string>();

      // Run twice, ensure IDs are different and opaque
      const r1 = compressBashOutput({
        command: "git status",
        commandFamily: "git-status",
        output,
        exitCode: 0,
        env: {},
        compressBashSuccesses: true,
        minCompressLines: 1,
        minCompressChars: 1,
        retainedOutputDir: retainedDir,
        sessionStartMs: SESSION_START_MS,
        classifyOutput: notSensitive,
      });

      const r2 = compressBashOutput({
        command: "git status",
        commandFamily: "git-status",
        output,
        exitCode: 0,
        env: {},
        compressBashSuccesses: true,
        minCompressLines: 1,
        minCompressChars: 1,
        retainedOutputDir: retainedDir,
        sessionStartMs: SESSION_START_MS,
        classifyOutput: notSensitive,
      });

      expect(r1.kind).toBe("summary");
      expect(r2.kind).toBe("summary");
      expect(r1.retainedOutputId).not.toBe(r2.retainedOutputId);
      // IDs should look like UUIDs or hex strings, not "retained-1"
      expect(r1.retainedOutputId).toMatch(/^[a-f0-9-]+$/);
      expect(r2.retainedOutputId).toMatch(/^[a-f0-9-]+$/);
    });

    it("fails closed — returns pass-through if retention IO fails", () => {
      // Use a non-writable path (e.g., root-owned dir)
      const badDir = "/root/retained-output";

      const output = Array.from({ length: 30 }, (_, i) => `line ${i}`).join(
        "\n",
      );

      const result = compressBashOutput({
        command: "git status",
        commandFamily: "git-status",
        output,
        exitCode: 0,
        env: {},
        compressBashSuccesses: true,
        minCompressLines: 1,
        minCompressChars: 1,
        retainedOutputDir: badDir,
        sessionStartMs: SESSION_START_MS,
        classifyOutput: notSensitive,
      });

      // Should fail closed (pass-through) rather than throw
      expect(result.kind).toBe("pass-through");
      expect(result.retainedOutputId).toBeUndefined();
    });
  });

  describe("cleanupRetainedOutputs", () => {
    it("removes retained files older than TTL (24h) from session start", () => {
      const retainedDir = join(tmpDir, "retained-cleanup");
      const now = Date.now();
      const twentySixHoursMs = 26 * 60 * 60 * 1000;
      const sessionStartMs = now;

      mkdirSync(retainedDir, { recursive: true });

      // Create a fresh file (should NOT be cleaned)
      const freshFileName = "fresh-file";
      writeFileSync(join(retainedDir, freshFileName), "fresh content");

      // Create an old file (older than 24h before session start)
      const oldFileName = "old-file";
      const oldFilePath = join(retainedDir, oldFileName);
      writeFileSync(oldFilePath, "old content");
      // Set mtime to 25h before session start
      const oldTime = new Date(sessionStartMs - twentySixHoursMs);
      const fs = require("fs");
      fs.utimesSync(oldFilePath, oldTime, oldTime);

      // Run cleanup
      const result = cleanupRetainedOutputs(retainedDir, sessionStartMs);

      // Old file should be deleted
      expect(existsSync(oldFilePath)).toBe(false);
      // Fresh file should still exist
      expect(existsSync(join(retainedDir, freshFileName))).toBe(true);
      // Cleanup result should report the deletion
      expect(result).toContain(oldFileName);
    });

    it("preserves retained files newer than TTL", () => {
      const retainedDir = join(tmpDir, "retained-preserve");
      const now = Date.now();
      mkdirSync(retainedDir, { recursive: true });
      const newerFileName = "newer-file";
      writeFileSync(join(retainedDir, newerFileName), "newer content");

      const result = cleanupRetainedOutputs(retainedDir, now);

      expect(existsSync(join(retainedDir, newerFileName))).toBe(true);
    });

    it("handles missing or empty retained output dir gracefully", () => {
      const missingDir = join(tmpDir, "does-not-exist");

      // Should not throw
      expect(() =>
        cleanupRetainedOutputs(missingDir, Date.now()),
      ).not.toThrow();
    });
  });

  describe("summary content", () => {
    it("git-status summary mentions files changed", () => {
      const output = Array.from(
        { length: 5 },
        (_, i) => `  modified:   file-${i}.ts`,
      ).join("\n");

      const result = compressBashOutput({
        command: "git status",
        commandFamily: "git-status",
        output,
        exitCode: 0,
        env: {},
        compressBashSuccesses: true,
        minCompressLines: 1,
        minCompressChars: 1,
        retainedOutputDir: tmpDir,
        sessionStartMs: SESSION_START_MS,
        classifyOutput: notSensitive,
      });

      expect(result.kind).toBe("summary");
      expect(result.summary!.toLowerCase()).toContain("file");
    });

    it("git-log summary mentions commits", () => {
      const output = Array.from({ length: 30 }, (_, i) => `commit ${i}`).join(
        "\n",
      );

      const result = compressBashOutput({
        command: "git log",
        commandFamily: "git-log",
        output,
        exitCode: 0,
        env: {},
        compressBashSuccesses: true,
        minCompressLines: 1,
        minCompressChars: 1,
        retainedOutputDir: tmpDir,
        sessionStartMs: SESSION_START_MS,
        classifyOutput: notSensitive,
      });

      expect(result.kind).toBe("summary");
      expect(result.summary!.toLowerCase()).toContain("commit");
    });

    it("passing-tests summary mentions test count", () => {
      const output = [
        " ✓ test 1 passed",
        " ✓ test 2 passed",
        " ✓ test 3 passed",
        "",
        " Tests: 3 passed, 3 total",
      ].join("\n");

      const result = compressBashOutput({
        command: "pnpm test",
        commandFamily: "passing-tests",
        output,
        exitCode: 0,
        env: {},
        compressBashSuccesses: true,
        minCompressLines: 1,
        minCompressChars: 1,
        retainedOutputDir: tmpDir,
        sessionStartMs: SESSION_START_MS,
        classifyOutput: notSensitive,
      });

      expect(result.kind).toBe("summary");
      expect(result.summary!.toLowerCase()).toContain("pass");
    });
  });
});
