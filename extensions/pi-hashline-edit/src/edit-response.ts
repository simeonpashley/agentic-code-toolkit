/**
 * Edit response builders.
 *
 * Unified diff output: agent and user see the same content. The diff is
 * generated from structuredPatch hunks with hashline-formatted lines.
 */

import { generateDiffString } from "./edit-diff";
import {
  CONTENT_SEP,
  formatAnchor,
  computeLineHash,
  OOB_SENTINEL,
} from "./hashline";
import { PACKAGE_INFO } from "./package-info";

// ─── Public types ───────────────────────────────────────────────────────

export type EditMetrics = {
  edits_attempted: number;
  edits_noop: number;
  warnings: number;
  classification: "applied" | "noop";
  added_lines?: number;
  removed_lines?: number;
};

export type RecalibrationWindow = {
  status: "applied";
  path: string;
  start_line: number;
  end_line: number;
  lines: string[];
};

export type ConflictReason = "HASH_MISMATCH" | "LINE_DRIFT";

export type ConflictAnchor = {
  anchor: string;
  line: number;
  hash: string;
  text?: string;
};

export type ConflictState = {
  status: "failed";
  reason: ConflictReason;
  path: string;
  expected: ConflictAnchor[];
  actual: ConflictAnchor[];
  message: string;
};

export type HashMismatch = {
  line: number;
  expected: string;
  expectedText?: string;
  actual: string;
};

// ─── Builder inputs ─────────────────────────────────────────────────────

type NoopEditEntry = {
  editIndex: number;
  loc: string;
  currentContent: string;
};

export interface NoopResponseInput {
  path: string;
  noopEdits: NoopEditEntry[] | undefined;
  originalNormalized: string;
  snapshotId: string;
  editsAttempted: number;
  warnings: string[] | undefined;
}

export interface SuccessResponseInput {
  path: string;
  originalNormalized: string;
  result: string;
  warnings: string[] | undefined;
  snapshotId: string;
  editsAttempted: number;
  noopEditsCount: number;
}

export interface ConflictResponseInput {
  path: string;
  mismatches: HashMismatch[];
  fileLines: readonly string[];
  message: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function countDiffLines(diff: string, marker: "+" | "-"): number {
  if (!diff) return 0;
  let count = 0;
  for (const line of diff.split("\n")) {
    if (
      line.startsWith(marker) &&
      !line.startsWith(`${marker}${marker}${marker}`)
    ) {
      count += 1;
    }
  }
  return count;
}

function buildMetrics(args: {
  classification: "applied" | "noop";
  editsAttempted: number;
  noopEditsCount: number;
  warningsCount: number;
  addedLines?: number;
  removedLines?: number;
}): EditMetrics {
  const metrics: EditMetrics = {
    edits_attempted: args.editsAttempted,
    edits_noop: args.noopEditsCount,
    warnings: args.warningsCount,
    classification: args.classification,
  };
  if (args.addedLines !== undefined) metrics.added_lines = args.addedLines;
  if (args.removedLines !== undefined)
    metrics.removed_lines = args.removedLines;
  return metrics;
}

function warningsBlockOf(warnings: string[] | undefined): string {
  return warnings?.length ? `\n\nWarnings:\n${warnings.join("\n")}` : "";
}

function splitVisibleLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.endsWith("\n") ? text.split("\n").slice(0, -1) : text.split("\n");
}

function countVisibleLines(text: string): number {
  return splitVisibleLines(text).length;
}

function indexToLine(charIdx: number, text: string): number {
  let line = 1;
  for (let i = 0; i < charIdx && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function computeChangedLineRange(
  original: string,
  result: string,
  resultLines: readonly string[],
): { firstChangedLine: number; lastChangedLine: number } | null {
  if (original === result) return null;
  if (original.length === 0) {
    return { firstChangedLine: 1, lastChangedLine: resultLines.length };
  }

  if (result.startsWith(original) && original.endsWith("\n")) {
    return {
      firstChangedLine: countVisibleLines(original) + 1,
      lastChangedLine: resultLines.length,
    };
  }

  let firstDiff = 0;
  const minLen = Math.min(original.length, result.length);
  while (firstDiff < minLen && original[firstDiff] === result[firstDiff]) {
    firstDiff++;
  }
  if (firstDiff === minLen && original.length === result.length) return null;

  let lastOrig = original.length - 1;
  let lastRes = result.length - 1;
  while (
    lastOrig >= firstDiff &&
    lastRes >= firstDiff &&
    original[lastOrig] === result[lastRes]
  ) {
    lastOrig--;
    lastRes--;
  }

  const firstChangedLine = Math.min(
    Math.max(1, indexToLine(firstDiff + 1, result)),
    Math.max(1, resultLines.length),
  );
  const lastChangedLine =
    lastRes < firstDiff
      ? Math.max(1, resultLines.length)
      : Math.min(
          Math.max(firstChangedLine, indexToLine(lastRes + 1, result)),
          Math.max(1, resultLines.length),
        );

  return { firstChangedLine, lastChangedLine };
}

export function buildRecalibrationWindow(input: {
  path: string;
  originalNormalized: string;
  result: string;
  bufferLines?: number;
}): RecalibrationWindow {
  const resultLines = splitVisibleLines(input.result);
  if (resultLines.length === 0) {
    return {
      status: "applied",
      path: input.path,
      start_line: 0,
      end_line: 0,
      lines: [],
    };
  }
  const changedRange = computeChangedLineRange(
    input.originalNormalized,
    input.result,
    resultLines,
  ) ?? { firstChangedLine: 1, lastChangedLine: resultLines.length };

  const buffer = input.bufferLines ?? 4;
  const startLine = Math.max(1, changedRange.firstChangedLine - buffer);
  const endLine = Math.min(
    resultLines.length,
    changedRange.lastChangedLine + buffer,
  );
  const lines = resultLines.slice(startLine - 1, endLine).map((line, index) => {
    const lineNumber = startLine + index;
    const hash = computeLineHash(resultLines, lineNumber - 1);
    return `${formatAnchor(lineNumber, hash)}${CONTENT_SEP}${line}`;
  });

  return {
    status: "applied",
    path: input.path,
    start_line: startLine,
    end_line: endLine,
    lines,
  };
}

export function buildConflictResponse(
  input: ConflictResponseInput,
): ToolResult<{
  diff: string;
  conflict: ConflictState;
  package: typeof PACKAGE_INFO;
}> {
  const unique = uniqueMismatches(input.mismatches);
  const hasLineDrift = unique.some((m) => m.actual === OOB_SENTINEL);
  const reason: ConflictReason = hasLineDrift ? "LINE_DRIFT" : "HASH_MISMATCH";
  const expected = unique.map((m) => ({
    anchor: formatAnchor(m.line, m.expected),
    line: m.line,
    hash: m.expected,
    ...(m.expectedText !== undefined ? { text: m.expectedText } : {}),
  }));
  const actual = unique.map((m) => {
    const text = input.fileLines[m.line - 1];
    if (m.actual === OOB_SENTINEL || typeof text !== "string") {
      return {
        anchor: `OOB(file has ${input.fileLines.length} line${input.fileLines.length === 1 ? "" : "s"})`,
        line: m.line,
        hash: OOB_SENTINEL,
      };
    }
    const hash = computeLineHash(input.fileLines, m.line - 1);
    return {
      anchor: formatAnchor(m.line, hash),
      line: m.line,
      hash,
      text,
    };
  });
  const conflict: ConflictState = {
    status: "failed",
    reason,
    path: input.path,
    expected,
    actual,
    message: input.message,
  };
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ status: "failed", conflict }),
      },
    ],
    isError: true,
    details: {
      diff: "",
      conflict,
      package: PACKAGE_INFO,
    },
  };
}

function uniqueMismatches(mismatches: readonly HashMismatch[]): HashMismatch[] {
  const seen = new Set<string>();
  return mismatches.filter((m) => {
    const key = `${m.line}:${m.expected}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Builders ───────────────────────────────────────────────────────────

export function buildNoopResponse(input: NoopResponseInput): ToolResult<{
  diff: string;
  snapshotId: string;
  classification: "noop";
  metrics: EditMetrics;
  package: typeof PACKAGE_INFO;
}> {
  const { path, noopEdits, snapshotId, editsAttempted, warnings } = input;

  const noopDetailsText = noopEdits?.length
    ? noopEdits
        .map(
          (edit) =>
            `Edit ${edit.editIndex}: replacement for ${edit.loc} is identical to current content:\n  ${edit.loc}: ${edit.currentContent}`,
        )
        .join("\n")
    : "The edits produced identical content.";

  const text = `No changes made to ${path}\nClassification: noop\n${noopDetailsText}`;

  const metrics = buildMetrics({
    classification: "noop",
    editsAttempted,
    noopEditsCount: noopEdits?.length ?? 0,
    warningsCount: warnings?.length ?? 0,
  });

  return {
    content: [{ type: "text", text }],
    details: {
      diff: "",
      snapshotId,
      classification: "noop" as const,
      metrics,
      package: PACKAGE_INFO,
    },
  };
}

export function buildChangedResponse(input: SuccessResponseInput): ToolResult<{
  diff: string;
  warnings: string[] | undefined;
  snapshotId: string;
  recalibration_window: RecalibrationWindow;
  metrics: EditMetrics;
  package: typeof PACKAGE_INFO;
}> {
  const {
    result,
    warnings,
    snapshotId,
    originalNormalized,
    editsAttempted,
    noopEditsCount,
  } = input;

  const diffResult = generateDiffString(originalNormalized, result);
  const addedLines = countDiffLines(diffResult.diff, "+");
  const removedLines = countDiffLines(diffResult.diff, "-");
  const warningsBlock = warningsBlockOf(warnings);

  const recalibrationWindow = buildRecalibrationWindow({
    path: input.path,
    originalNormalized,
    result,
  });
  const editAppliedText = "Edit applied.";
  const recalibrationText = `recalibration_window:\n${recalibrationWindow.lines.join("\n")}`;

  const text = [editAppliedText, warningsBlock.trimStart(), recalibrationText]
    .filter((section) => section.length > 0)
    .join("\n\n");

  const metrics = buildMetrics({
    classification: "applied",
    editsAttempted,
    noopEditsCount,
    warningsCount: warnings?.length ?? 0,
    addedLines,
    removedLines,
  });

  return {
    content: [{ type: "text", text }],
    details: {
      diff: diffResult.diff,
      warnings,
      snapshotId,
      recalibration_window: recalibrationWindow,
      metrics,
      package: PACKAGE_INFO,
    },
  };
}

// Local shape — pi-coding-agent does not export a public `ToolResult`.
// This file intentionally does not import the agent's tool-result type to
// stay decoupled from internals.
type ToolResult<TDetails extends object = Record<string, unknown>> = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  details: TDetails;
};
