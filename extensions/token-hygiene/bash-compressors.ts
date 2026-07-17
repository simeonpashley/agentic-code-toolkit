/**
 * Bash Compressors — Phase 2 token-hygiene extension.
 *
 * Compresses large bash outputs into summaries, retaining the full output
 * to disk with an opaque ID. Integrates with evaluateCompressionEligibility
 * from compression-guards.ts for eligibility checks.
 *
 * Security properties:
 *   - Exclusive file creation (O_EXCL) prevents races
 *   - 0700 directory / 0600 file permissions
 *   - Opaque IDs (UUIDv4) prevent sequential guessing
 *   - TTL cleanup (24h from session start)
 *   - Fail-closed: any IO error → pass-through
 *   - Sensitive/unknown outputs are never retained
 */
import { randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  writeSync,
  closeSync,
  readdirSync,
  statSync,
  unlinkSync,
  constants,
} from "fs";
import { join } from "path";
import { evaluateCompressionEligibility } from "./compression-guards";
import { classifySensitiveOutput } from "./sensitive-output-detector";
import type {
  BashCompressorResult,
  CompressionDecision,
  SensitiveClassification,
  CompressionEligibility,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────

/** Retained output TTL: 24 hours in milliseconds. */
export const RETAINED_TTL_MS = 24 * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────

export type CompressBashOutputInput = {
  /** The raw command string (e.g. "git status -s"). */
  command: string;
  /** The compressor family identifier, or null if no family matched. */
  commandFamily: string | null;
  /** Full stdout+stderr output of the command. */
  output: string;
  /** Exit code of the command. */
  exitCode: number;
  /** Environment variables at command execution time. */
  env: Record<string, string | undefined>;
  /** Whether bash compression is enabled in config. */
  compressBashSuccesses: boolean;
  /** Minimum lines before compression is considered. */
  minCompressLines: number;
  /** Minimum characters before compression is considered. */
  minCompressChars: number;
  /** Directory to store retained output files. */
  retainedOutputDir: string;
  /** Session start timestamp (epoch ms) for TTL calculation. */
  sessionStartMs: number;
  /** Function to classify output as sensitive or not. */
  classifyOutput?: (output: string) => SensitiveClassification;
};

// ── Summary generators per family ─────────────────────────────────────────

/** Generate a human-readable summary for a git-status output. */
function summarizeGitStatus(output: string): string {
  const lines = output.split("\n");
  const changedCount = lines.filter(
    (l) =>
      /^\s*(modified|new file|renamed|deleted|added):\s+/.test(l) ||
      /^\?\?/.test(l),
  ).length;

  // Count untracked files (lines starting with ?? or under "Untracked files:")
  const untracked = lines.filter(
    (l) => l.startsWith("??") || /^\s+/.test(l),
  ).length;

  const parts: string[] = [];
  if (changedCount > 0) parts.push(`${changedCount} files changed`);
  if (untracked > 0) parts.push(`${untracked} untracked`);
  if (parts.length === 0) parts.push("clean");

  return `Git status: ${parts.join(", ")}`;
}

/** Generate a human-readable summary for a git-log output. */
function summarizeGitLog(output: string): string {
  const commitCount = (output.match(/^commit\s/m) || []).length;
  const lineCount = output.split("\n").length;
  return `Git log: ${commitCount} commits (${lineCount} lines)`;
}

/** Generate a human-readable summary for test output. */
function summarizeTestOutput(output: string): string {
  const lines = output.split("\n");
  // Look for lines that look like final summary (Tests: N passed, Test Files: M)
  const summaryLine = lines.find(
    (l) =>
      /^\s*Tests?:?\s+\d+\s+(passed|failed)/i.test(l.trim()) ||
      /^\s*Test Files?:\s+\d+/.test(l.trim()),
  );
  if (summaryLine) return summaryLine.trim();

  // Fall back to counting pass/fail indicators
  const passed = lines.filter(
    (l) => /[✓✔]/.test(l) || /\bPASS\b/.test(l) || /\bpassed\b/.test(l),
  ).length;
  return passed > 0 ? `Tests: ${passed} passed` : "Tests passed";
}

/** Generate a human-readable summary for build output. */
function summarizeBuildOutput(output: string, lineCount: number): string {
  const lines = output.split("\n");
  // Look for a build success message
  const successLine = lines.find(
    (l) => /build/i.test(l) && /(succeeded|success|complete|done)/i.test(l),
  );
  if (successLine) return successLine.trim();
  return `Build output: ${lineCount} lines`;
}

/** Generate a human-readable summary for package-install output. */
function summarizePackageInstall(output: string): string {
  const added = (output.match(/^\+ /gm) || []).length;
  const updated = (
    output.match(/^up\s/gm) ||
    output.match(/^updated\s/gm) ||
    []
  ).length;
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (updated > 0) parts.push(`${updated} updated`);
  if (parts.length === 0) parts.push("completed");
  return `Package install: ${parts.join(", ")}`;
}

/** Generate a human-readable summary for large-listing output. */
function summarizeListing(output: string): string {
  const lines = output.split("\n").filter((l) => l.trim());
  const fileCount = lines.filter(
    (l) => /^-/.test(l) || (/^[^dtlspc]/.test(l) && !l.startsWith("total ")),
  ).length;
  const dirCount = lines.filter((l) => /^d/.test(l)).length;
  const parts: string[] = [];
  if (fileCount > 0) parts.push(`${fileCount} files`);
  if (dirCount > 0) parts.push(`${dirCount} dirs`);
  if (parts.length === 0) parts.push("empty");
  return `Listing: ${parts.join(", ")}`;
}

/**
 * Dispatch to the appropriate summary generator based on command family.
 * Falls back to a generic line-count summary for unknown families.
 */
function generateSummary(family: string, output: string): string {
  const lineCount = output.split("\n").length;

  switch (family) {
    case "git-status":
      return summarizeGitStatus(output);
    case "git-log":
      return summarizeGitLog(output);
    case "passing-tests":
      return summarizeTestOutput(output);
    case "successful-builds":
      return summarizeBuildOutput(output, lineCount);
    case "package-install":
      return summarizePackageInstall(output);
    case "large-listing":
      return summarizeListing(output);
    default:
      return `Command output hidden (${lineCount} lines)`;
  }
}

/**
 * Detect the compressor family for a bash command string.
 *
 * Returns the family identifier if the command matches a known compressor family,
 * or null if no family matched. Phase 2 will fail-closed (pass-through) for null.
 */
export function detectCompressorFamily(command: string): string | null {
  const trimmed = command.trim();
  const head = trimmed.split(/\s+/)[0] ?? "";

  if (
    head === "git" &&
    /^git\s+status\b/.test(trimmed) &&
    !/--short\b/.test(trimmed)
  ) {
    return "git-status";
  }
  if (head === "git" && /^git\s+log\b/.test(trimmed)) {
    return "git-log";
  }
  if (
    /^pnpm\s+(test|run\s+test|vitest)/.test(trimmed) ||
    /^vitest\s+run\b/.test(trimmed) ||
    /^npm\s+test\b/.test(trimmed)
  ) {
    return "passing-tests";
  }
  if (
    /^pnpm\s+(build|run\s+build)/.test(trimmed) ||
    /^npm\s+run\s+build\b/.test(trimmed) ||
    /^tsc\b/.test(trimmed)
  ) {
    return "successful-builds";
  }
  if (/^(pnpm|npm|yarn)\s+install\b/.test(trimmed)) {
    return "package-install";
  }
  if (head === "find" || /^ls\s+-R\b/.test(trimmed)) {
    return "large-listing";
  }
  return null;
}

// ── Retained output lifecycle ─────────────────────────────────────────────

/**
 * Retain the full output to a file on disk.
 *
 * Security guarantees:
 *   - Exclusive create (O_EXCL) prevents TOCTOU races
 *   - Opaque IDs (UUIDv4) prevent sequential guessing
 *   - Directory created with 0700 permissions
 *   - File created with 0600 permissions
 *   - Fail-closed on any IO error
 */
function retainOutput(
  output: string,
  retainedDir: string,
): { success: boolean; id?: string } {
  try {
    if (!existsSync(retainedDir)) {
      mkdirSync(retainedDir, { recursive: true, mode: 0o700 });
    }

    const id = randomUUID();
    const filePath = join(retainedDir, id);

    // Exclusive create + 0600 permissions
    const fd = openSync(
      filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      writeSync(fd, output);
    } finally {
      closeSync(fd);
    }

    return { success: true, id };
  } catch {
    // Fail-closed: any IO error means we don't retain
    return { success: false };
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Helper to build a pass-through decision with given reason.
 */
function makePassThroughDecision(
  family: string | null,
  originalChars: number,
  originalLines: number,
  reason: CompressionEligibility,
): CompressionDecision {
  return {
    family,
    applied: false,
    originalChars,
    originalLines,
    compressedChars: 0,
    compressedLines: 0,
    neverCompressReason: reason,
    retainedOutputId: null,
  };
}

/**
 * Compress a bash command output.
 *
 * Checks eligibility using evaluateCompressionEligibility, then for eligible
 * outputs generates a summary and retains the full output to disk.
 *
 * @returns BashCompressorResult with decision metadata for metrics emission.
 */
export function compressBashOutput(
  input: CompressBashOutputInput,
): BashCompressorResult {
  const family = input.commandFamily ?? detectCompressorFamily(input.command);
  const classifier = input.classifyOutput ?? classifySensitiveOutput;
  const originalChars = input.output.length;
  const originalLines = input.output.split("\n").length;

  // 1. Check eligibility via compression guards
  const eligibility = evaluateCompressionEligibility({
    compressBashSuccesses: input.compressBashSuccesses,
    command: input.command,
    commandFamily: family,
    exitCode: input.exitCode,
    output: input.output,
    env: input.env,
    minCompressLines: input.minCompressLines,
    minCompressChars: input.minCompressChars,
    classifyOutput: classifier,
  });

  if (eligibility !== "eligible") {
    return {
      kind: "pass-through",
      decision: makePassThroughDecision(
        family,
        originalChars,
        originalLines,
        eligibility,
      ),
    };
  }

  // 2. Defense-in-depth: never retain sensitive/unknown outputs
  const sensitive = classifier(input.output);
  if (sensitive === "sensitive" || sensitive === "unknown") {
    return {
      kind: "pass-through",
      decision: makePassThroughDecision(
        family,
        originalChars,
        originalLines,
        "sensitive-output",
      ),
    };
  }

  // 3. Generate summary based on command family
  const summary = generateSummary(family!, input.output);

  // 4. Retain full output to disk
  const retention = retainOutput(input.output, input.retainedOutputDir);
  if (!retention.success) {
    return {
      kind: "pass-through",
      decision: makePassThroughDecision(
        family,
        originalChars,
        originalLines,
        "retention-failed",
      ),
    };
  }

  // 5. Return compressed result
  const compressedChars = summary.length;
  const compressedLines = summary.split("\n").length;
  return {
    kind: "summary",
    summary,
    retainedOutputId: retention.id!,
    decision: {
      family,
      applied: true,
      originalChars,
      originalLines,
      compressedChars,
      compressedLines,
      neverCompressReason: null,
      retainedOutputId: retention.id!,
    },
  };
}

/**
 * Remove retained output files older than TTL (24h) from session start.
 *
 * @param retainedDir - Directory containing retained output files
 * @param sessionStartMs - Session start timestamp (epoch ms)
 * @returns Array of removed file names (empty if none removed)
 */
export function cleanupRetainedOutputs(
  retainedDir: string,
  sessionStartMs: number,
): string[] {
  try {
    if (!existsSync(retainedDir)) return [];

    const cutoffMs = sessionStartMs - RETAINED_TTL_MS;
    const removed: string[] = [];

    const entries = readdirSync(retainedDir);
    for (const entry of entries) {
      const filePath = join(retainedDir, entry);
      try {
        const stats = statSync(filePath);
        if (stats.isFile() && stats.mtimeMs < cutoffMs) {
          unlinkSync(filePath);
          removed.push(entry);
        }
      } catch {
        // Skip files we can't stat or unlink
      }
    }

    return removed;
  } catch {
    return [];
  }
}
