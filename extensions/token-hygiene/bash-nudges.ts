/**
 * Narrow bash file-dump nudges and large-read warning logic.
 *
 * Phase 0/1: nudge only obvious file-dump commands; do not warn for
 * filtered/transform commands. Large bash output is report-only.
 */

import type { BashNudgeClassification } from "./types.ts";

export interface BashNudgeResult {
  classification: BashNudgeClassification;
  warning?: string;
}

export interface LargeReadResult {
  isLarge: boolean;
  warning?: string;
}

// Command patterns for file-dump nudges
const CAT_FILE_RE = /^cat\s+(\S+)(?:\s|$)/;
const HEAD_FILE_RE = /^head\s+(\S+)(?:\s|$)/;
const TAIL_FILE_RE = /^tail\s+(\S+)(?:\s|$)/;
const SED_RANGE_PRINT_RE =
  /^sed\s+(?:-n\s+)?['"]?\s*\d+\s*,\s*\d+\s*p\s*['"]?\s+(\S+)/;
const FIND_NO_MAXDEPTH_RE = /^find\s+\S+(?!.*-maxdepth)/;
const LS_R_RECURSIVE_RE = /^ls\s+-[a-zA-Z]*R[a-zA-Z]*/;

/**
 * Classify a bash command into a nudge category or no-nudge.
 */
export function classifyBashCommand(command: string): BashNudgeResult {
  const trimmed = command.trim();

  // === DO NOT NUDGE ===
  // Pipelines (contains |)
  if (trimmed.includes("|")) {
    return { classification: "no-nudge" };
  }

  // Here-documents (cat > file, cat <<EOF, etc.)
  if (/^cat\s+[<>]/.test(trimmed) || /^cat\s+.*<<\s*\w/.test(trimmed)) {
    return { classification: "no-nudge" };
  }

  // Grep, rg, awk, jq, transform sed
  if (/^(grep|rg|awk|jq)\s/.test(trimmed)) {
    return { classification: "no-nudge" };
  }

  // transform-style sed (substitution)
  if (/^sed\s+.*s\//.test(trimmed)) {
    return { classification: "no-nudge" };
  }

  // tree, build/test/install, git, process inspection, log streaming
  if (
    /^(tree|pnpm|npm|yarn|npx|make|cmake|git|ps\s|top\s|htop|journalctl|tail\s+-f|ping|curl|wget|ssh|scp)\s/.test(
      trimmed,
    )
  ) {
    return { classification: "no-nudge" };
  }

  // Binary probes (xxd, od, hexdump, file, etc.)
  if (
    /^(xxd|od|hexdump|file\s|strings|stat\s|wc\s|du\s|df\s|which|whereis)\s/.test(
      trimmed,
    )
  ) {
    return { classification: "no-nudge" };
  }

  // Mutating commands (write/delete operations)
  if (/^(rm|mv|cp|mkdir|touch|chmod|chown|ln|dd|install)\s/.test(trimmed)) {
    return { classification: "no-nudge" };
  }

  // === NUDGE CANDIDATES ===

  // cat <file>
  const catMatch = trimmed.match(CAT_FILE_RE);
  if (catMatch) {
    const args = trimmed
      .split(/\s+/)
      .slice(1)
      .filter((a) => !a.startsWith("-"));
    // If cat reads files (more than just flags)
    if (args.length > 0) {
      return {
        classification: "cat-file",
        warning:
          "Token hygiene: prefer `read(path, offset, limit, raw)` for file inspection. It gives truncation metadata and edit anchors when needed.",
      };
    }
  }

  // head <file>
  if (HEAD_FILE_RE.test(trimmed)) {
    return {
      classification: "head-file",
      warning:
        "Token hygiene: prefer `read(path, offset, limit, raw)` for file inspection. It gives truncation metadata and edit anchors when needed.",
    };
  }

  // tail <file>
  if (TAIL_FILE_RE.test(trimmed)) {
    return {
      classification: "tail-file",
      warning:
        "Token hygiene: prefer `read(path, offset, limit, raw)` for file inspection. It gives truncation metadata and edit anchors when needed.",
    };
  }

  // sed -n '<range>p' <file>
  if (SED_RANGE_PRINT_RE.test(trimmed)) {
    return {
      classification: "sed-range-print",
      warning:
        "Token hygiene: prefer `read(path, offset, limit, raw)` for file inspection. It gives truncation metadata and edit anchors when needed.",
    };
  }

  // unbounded find (no -maxdepth, no glob pattern)
  if (FIND_NO_MAXDEPTH_RE.test(trimmed)) {
    // Check if it has at least a path argument (not just options)
    const args = trimmed.split(/\s+/).slice(1);
    const hasPathArg = args.some((a) => !a.startsWith("-"));
    if (hasPathArg) {
      return {
        classification: "find-unbounded",
        warning:
          "Token hygiene: unbounded `find` may produce large output. Add `-maxdepth` and a type/name filter, or use `glob()` which limits results automatically.",
      };
    }
  }

  // ls -R (recursive listing)
  if (LS_R_RECURSIVE_RE.test(trimmed)) {
    return {
      classification: "ls-R-large",
      warning:
        "Token hygiene: `ls -R` produces recursive listings. Prefer `find` with `-maxdepth` or `glob()` for structured file discovery.",
    };
  }

  return { classification: "no-nudge" };
}

/**
 * Evaluate whether a read result is a large read (no limit on a big file).
 */
export function evaluateLargeRead(
  lineCount: number,
  hadLimit: boolean,
  threshold: number,
): LargeReadResult {
  if (!hadLimit && lineCount >= threshold) {
    return {
      isLarge: true,
      warning: `Token hygiene: this file is ${lineCount} lines and was read without a \`limit\`. A focused \`limit\` may use fewer tokens.`,
    };
  }
  return { isLarge: false };
}

/**
 * Redact a command for metrics reporting.
 */
export function redactCommandSummary(command: string): string {
  // Extract first word (command name) and total length
  const firstWord = command.trim().split(/\s+/)[0] ?? "";
  const argCount = command.trim().split(/\s+/).length - 1;
  const totalLen = command.length;
  return `${firstWord} (${argCount} args, ${totalLen} chars)`;
}
