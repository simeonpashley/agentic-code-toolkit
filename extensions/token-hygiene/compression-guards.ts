import type { CompressionEligibility, SensitiveClassification } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────

export type CompressionGuardMatchInput = {
  command: string;
  output: string;
  exitCode: number;
  env: Record<string, string | undefined>;
};

export type CompressionGuard = {
  reason: CompressionEligibility;
  matches: (input: CompressionGuardMatchInput) => boolean;
};

// ── Individual guard factories ────────────────────────────────────────────

/**
 * Guard: matches git diff and plain diff commands.
 */
const isDiffGuard: CompressionGuard = {
  reason: "never-compress",
  matches: ({ command }) => {
    const trimmed = command.trimStart();
    // git diff or git diff-* (like git difftool)
    if (/^git\s+diff/.test(trimmed)) return true;
    // plain diff command
    if (/^diff\b/.test(trimmed)) return true;
    return false;
  },
};

/**
 * Guard: matches cat, head, tail, and sed -n range file reads.
 */
const isFileReadGuard: CompressionGuard = {
  reason: "never-compress",
  matches: ({ command }) => {
    const trimmed = command.trimStart();
    // cat, head, tail commands
    if (/^(cat|head|tail)\b/.test(trimmed)) return true;
    // sed -n with a range (p flag)
    if (/^sed\s+-n\b/.test(trimmed)) return true;
    return false;
  },
};

/**
 * Guard: matches curl and wget responses.
 */
const isFetchGuard: CompressionGuard = {
  reason: "never-compress",
  matches: ({ command }) => {
    const trimmed = command.trimStart();
    if (/^curl\b/.test(trimmed)) return true;
    if (/^wget\b/.test(trimmed)) return true;
    return false;
  },
};

/**
 * Guard: matches commands with --verbose, --debug, or -v verbose flags.
 * -v is treated as verbose unless the command is a known invert-match tool
 * (grep, rg, ag, ack) where -v means invert-match.
 */
const isVerboseDebugGuard: CompressionGuard = {
  reason: "never-compress",
  matches: ({ command }) => {
    const trimmed = command.trimStart();

    // --verbose or --debug anywhere in the command
    // Using .includes() because -- has non-word chars where \b would not match
    if (trimmed.includes("--verbose")) return true;
    if (trimmed.includes("--debug")) return true;

    // -v flag: only treat as verbose if NOT on a known invert-match command
    const firstWord = trimmed.split(/\s+/)[0];
    const invertMatchCommands = new Set(["grep", "rg", "ag", "ack"]);
    if (firstWord && invertMatchCommands.has(firstWord)) {
      return false; // -v means invert-match, not verbose
    }

    // Standalone -v as a token (preceded by space or at start of args)
    if (/\s+-v\b/.test(trimmed) || /^-v\b/.test(trimmed)) return true;

    return false;
  },
};

/**
 * Guard: matches PI_TOKEN_HYGIENE_NO_COMPRESS=1 in the environment.
 */
const noCompressEnvGuard: CompressionGuard = {
  reason: "never-compress",
  matches: ({ env }) => {
    return env["PI_TOKEN_HYGIENE_NO_COMPRESS"] === "1";
  },
};

// ── Exported guards list ──────────────────────────────────────────────────

/**
 * All never-compress guards. Evaluated in order by evaluateCompressionEligibility.
 */
export const NEVER_COMPRESS_GUARDS: readonly CompressionGuard[] = [
  isDiffGuard,
  isFileReadGuard,
  isFetchGuard,
  isVerboseDebugGuard,
  noCompressEnvGuard,
];

// ── Eligibility evaluation ───────────────────────────────────────────────

export type EligibilityInput = {
  /** Whether bash compression is enabled in config. */
  compressBashSuccesses: boolean;
  /** The raw command string (e.g. "git status -s"). */
  command: string;
  /** The compressor family identifier, or null if no family matched. */
  commandFamily: string | null;
  /** Exit code of the command. */
  exitCode: number;
  /** Full stdout+stderr output of the command. */
  output: string;
  /** Environment variables at command execution time. */
  env: Record<string, string | undefined>;
  /** Minimum lines before compression is considered. */
  minCompressLines: number;
  /** Minimum characters before compression is considered. */
  minCompressChars: number;
  /** Function to classify output as sensitive or not. */
  classifyOutput: (output: string) => SensitiveClassification;
};

/**
 * Evaluate whether command output is eligible for compression.
 *
 * Returns one of the CompressionEligibility values:
 * 1. `disabled-by-config` — compressBashSuccesses is false
 * 2. `non-zero-exit` — exit code is non-zero
 * 3. `unknown-family` — command does not match a known compressor family
 * 4. `never-compress` — a never-compress guard matched
 * 5. `below-threshold` — output is below configured minimums
 * 6. `sensitive-output` — output is classified as sensitive or unknown
 * 7. `eligible` — all conditions met for compression
 */
export function evaluateCompressionEligibility(
  input: EligibilityInput,
): CompressionEligibility {
  // 1. Config check
  if (!input.compressBashSuccesses) {
    return "disabled-by-config";
  }

  // 2. Exit code check
  if (input.exitCode !== 0) {
    return "non-zero-exit";
  }

  // 3. Unknown family check
  if (input.commandFamily === null) {
    return "unknown-family";
  }

  // 4. Never-compress guards
  for (const guard of NEVER_COMPRESS_GUARDS) {
    if (
      guard.matches({
        command: input.command,
        output: input.output,
        exitCode: input.exitCode,
        env: input.env,
      })
    ) {
      return "never-compress";
    }
  }

  // 5. Threshold checks
  const lines = input.output.split("\n").length;
  if (lines < input.minCompressLines) {
    return "below-threshold";
  }
  if (input.output.length < input.minCompressChars) {
    return "below-threshold";
  }

  // 6. Sensitive output check
  const classification = input.classifyOutput(input.output);
  if (classification === "sensitive" || classification === "unknown") {
    return "sensitive-output";
  }

  // 7. All checks passed
  return "eligible";
}
