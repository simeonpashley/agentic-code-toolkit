/**
 * Hash-based anchor relocation.
 *
 * When anchors are stale against the live file, search ±OFFSET lines for
 * the anchor's hash. Both endpoints shift by the same offset. Only accepts
 * a single unique match; rejects on zero or multiple matches.
 *
 * No content comparison — purely hash-based.
 *
 * Window sizing: the offset window scales with file size
 * (`computeFuzzyOffsetWindow`) so a small file stays tight (low cost,
 * low ambiguity) while a large file has more drift headroom. See
 * `hashline-stale-anchor-recovery` note in AGENTS.md for context.
 */
import { type Anchor, type HashlineFile, type HashlineEdit } from "./hashline";

// Legacy minimums — preserved so behaviour never regresses below what the
// engine used to do. New windows are at least this large.
const MIN_OFFSET_SINGLE = 1;
const MIN_OFFSET_RANGE = 2;
// Upper bound. The fuzzy search is O(2*maxOffset) per edit, so the cap
// keeps the engine cheap on huge files and keeps ambiguity rejection
// meaningful (a 1000-line window on a 100k-line file would silently
// relocate many anchors to the wrong place).
const MAX_OFFSET = 25;

/**
 * Compute the fuzzy search window for a file of `lineCount` lines.
 *
 * Growth rule: `ceil(sqrt(lineCount) / 2)`, clamped to
 * `[MIN_OFFSET_SINGLE, MAX_OFFSET]`. This gives roughly:
 *   - 4 lines    → 1  (single) / 2 (range)
 *   - 100 lines  → 5
 *   - 400 lines  → 10
 *   - 1600 lines → 20
 *   - 10k+ lines → 25 (capped)
 *
 * The `kind` parameter is accepted for symmetry — current implementation
 * uses one window for both single and range edits because the pos/end
 * shift-together invariant dominates the cost. Kept in the signature
 * so callers don't have to special-case.
 */
export function computeFuzzyOffsetWindow(
  lineCount: number,
  _kind: "single" | "range",
): number {
  const safeLines = Math.max(1, lineCount);
  const scaled = Math.ceil(Math.sqrt(safeLines) / 2);
  const min = MIN_OFFSET_SINGLE;
  const max = MAX_OFFSET;
  return Math.max(min, Math.min(max, scaled));
}

/**
 * Result shape shared by all matchers (exact, fuzzy, snapshot).
 */
export interface MatchResult {
  matched: HashlineEdit[];
  unmatched: HashlineEdit[];
  warnings: string[];
}

function anchorsMatchAt(
  file: HashlineFile,
  anchors: readonly Anchor[],
  offset = 0,
): boolean {
  return anchors.every((anchor) => {
    const line = anchor.line + offset;
    return (
      line >= 1 &&
      line <= file.lines.length &&
      file.lineHashes[line - 1] === anchor.hash &&
      (anchor.textHint === undefined ||
        file.lines[line - 1] === anchor.textHint)
    );
  });
}

/**
 * Partition edits by hash and read-block content validity against a file.
 */
export function partitionExact(
  edits: HashlineEdit[],
  file: HashlineFile,
): MatchResult {
  const matched: HashlineEdit[] = [];
  const unmatched: HashlineEdit[] = [];

  for (const edit of edits) {
    const anchors =
      edit.expected ?? (edit.end ? [edit.pos, edit.end] : [edit.pos]);
    if (anchorsMatchAt(file, anchors)) {
      matched.push(edit);
    } else {
      unmatched.push(edit);
    }
  }

  return { matched, unmatched, warnings: [] };
}

/**
 * Relocate stale edits by searching ±maxOffset lines in the live file for
 * the anchor's hash. Both endpoints shift by the same offset. Only accepts
 * a single unique match; rejects on zero or multiple matches.
 *
 * The anchor hash stays unchanged — we found it at the new position.
 */
export function fuzzyMatch(
  edits: HashlineEdit[],
  currentFile: HashlineFile,
  precomputedWindow?: number,
): MatchResult {
  const matched: HashlineEdit[] = [];
  const unmatched: HashlineEdit[] = [];
  const warnings: string[] = [];
  let relocationCount = 0;

  // Window is shared across all edits in this batch so the cost is bounded.
  const window =
    precomputedWindow ??
    computeFuzzyOffsetWindow(currentFile.lines.length, "single");

  for (const edit of edits) {
    const startLine = edit.pos.line;
    const endLine = edit.end?.line ?? startLine;

    const isSingle = edit.end === undefined || edit.end.line === edit.pos.line;
    const minRequired = isSingle ? MIN_OFFSET_SINGLE : MIN_OFFSET_RANGE;
    const maxOffset = Math.max(minRequired, window);

    // Search current file for the hash within ±maxOffset
    let bestOffset: number | null = null;

    for (let offset = -maxOffset; offset <= maxOffset; offset++) {
      const newStart = startLine + offset;
      const newEnd = endLine + offset;
      if (newStart < 1 || newEnd > currentFile.lines.length) continue;

      const anchors =
        edit.expected ?? (edit.end ? [edit.pos, edit.end] : [edit.pos]);
      if (!anchorsMatchAt(currentFile, anchors, offset)) continue;

      if (bestOffset !== null) {
        // Multiple matches — reject
        bestOffset = null;
        break;
      }
      bestOffset = offset;
    }

    if (bestOffset === null) {
      unmatched.push(edit);
      continue;
    }

    // Relocate: shift both anchors by the offset, hash stays the same.
    const newStart = startLine + bestOffset;
    const newEnd = endLine + bestOffset;
    const relocated: HashlineEdit = {
      op: edit.op,
      pos: { line: newStart, hash: edit.pos.hash },
      lines: edit.lines,
      ...(edit.end ? { end: { line: newEnd, hash: edit.end.hash } } : {}),
      ...(edit.expected
        ? {
            expected: edit.expected.map((anchor) => ({
              ...anchor,
              line: anchor.line + bestOffset,
            })),
          }
        : {}),
    };

    matched.push(relocated);
    relocationCount++;
  }

  if (relocationCount > 0) {
    warnings.push(
      `[RELOCATED] ${relocationCount} range(s) relocated via hash matching (search window ±${window}). Please review the diff carefully.`,
    );
  }

  return { matched, unmatched, warnings };
}
