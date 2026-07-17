/**
 * Read/search discipline tracker.
 *
 * Tracks read and search observations in memory for the active session.
 * Warns on exact unchanged duplicates only.
 */

import type { TokenHygieneConfig } from "./types.ts";
import type { IdentifierHasher } from "./redaction.ts";
import type {
  ReadObservation,
  SearchObservation,
  DuplicateResult,
} from "./types.ts";

interface StoredRead {
  pathId: string;
  offset?: number;
  limit?: number;
  raw?: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
  contentFingerprint?: string;
  truncated?: boolean;
  suggestedNextOffset?: number;
  turn: number;
  warned: boolean;
}

interface StoredSearch {
  tool: string;
  key: string;
  pathScopeId?: string;
  turn: number;
  warned: boolean;
}

export interface ReadSearchTracker {
  recordRead(input: ReadObservation): DuplicateResult;
  recordSearch(input: SearchObservation): DuplicateResult;
  resetSession(): void;
  snapshot(): { reads: number; searches: number; warningsEmitted: number };
}

export function createReadSearchTracker(
  _config: TokenHygieneConfig,
  _hasher?: IdentifierHasher,
): ReadSearchTracker {
  const reads: StoredRead[] = [];
  const searches: StoredSearch[] = [];
  let warningsEmitted = 0;

  function isSameRead(a: StoredRead, b: ReadObservation): boolean {
    return (
      a.pathId === b.pathId &&
      a.offset === b.offset &&
      a.limit === b.limit &&
      a.raw === b.raw &&
      a.sizeBytes === b.sizeBytes &&
      a.mtimeMs === b.mtimeMs &&
      a.contentFingerprint === b.contentFingerprint
    );
  }

  function isChangedRead(prev: StoredRead, current: ReadObservation): boolean {
    // File changed if size or mtime differs
    if (
      prev.sizeBytes !== undefined &&
      current.sizeBytes !== undefined &&
      prev.sizeBytes !== current.sizeBytes
    ) {
      return true;
    }
    if (
      prev.mtimeMs !== undefined &&
      current.mtimeMs !== undefined &&
      prev.mtimeMs !== current.mtimeMs
    ) {
      return true;
    }
    if (
      prev.contentFingerprint !== undefined &&
      current.contentFingerprint !== undefined &&
      prev.contentFingerprint !== current.contentFingerprint
    ) {
      return true;
    }
    return false;
  }

  function isContinuationRead(
    prev: StoredRead,
    current: ReadObservation,
  ): boolean {
    // Previous was truncated and current reads at suggested next offset
    if (prev.truncated && prev.suggestedNextOffset !== undefined) {
      return current.offset === prev.suggestedNextOffset;
    }
    return false;
  }

  function isRawToAnchored(
    prev: StoredRead,
    current: ReadObservation,
  ): boolean {
    // Previous was raw: true and current is not raw (anchored)
    return prev.raw === true && current.raw !== true;
  }

  return {
    recordRead(input: ReadObservation): DuplicateResult {
      // Check for exact match
      for (const existing of reads) {
        if (isSameRead(existing, input)) {
          if (!existing.warned) {
            existing.warned = true;
            warningsEmitted++;
            return {
              classification: "exact-repeat",
              previousTurn: existing.turn,
            };
          }
          // Already warned for this exact duplicate
          return {
            classification: "exact-repeat",
            previousTurn: existing.turn,
          };
        }
      }

      // Check for changed file (no warning)
      for (const existing of reads) {
        if (
          existing.pathId === input.pathId &&
          isChangedRead(existing, input)
        ) {
          reads.push(toStored(input));
          return { classification: "none" };
        }
      }

      // Check for continuation read (no warning)
      for (const existing of reads) {
        if (
          existing.pathId === input.pathId &&
          isContinuationRead(existing, input)
        ) {
          reads.push(toStored(input));
          return { classification: "none" };
        }
      }

      // Check for raw-to-anchored transition (no warning)
      for (const existing of reads) {
        if (
          existing.pathId === input.pathId &&
          isRawToAnchored(existing, input)
        ) {
          reads.push(toStored(input));
          return { classification: "none" };
        }
      }

      // New observation
      reads.push(toStored(input));
      return { classification: "none" };
    },

    recordSearch(input: SearchObservation): DuplicateResult {
      for (const existing of searches) {
        if (
          existing.tool === input.tool &&
          existing.key === input.key &&
          existing.pathScopeId === input.pathScopeId
        ) {
          if (!existing.warned) {
            existing.warned = true;
            warningsEmitted++;
            return {
              classification: "repeated-search",
              previousTurn: existing.turn,
            };
          }
          return {
            classification: "repeated-search",
            previousTurn: existing.turn,
          };
        }
      }

      const entry = {
        tool: input.tool,
        key: input.key,
        pathScopeId: input.pathScopeId,
        turn: input.turn,
        warned: false,
      } as StoredSearch;
      searches.push(entry);
      return { classification: "none" };
    },

    resetSession(): void {
      reads.length = 0;
      searches.length = 0;
      warningsEmitted = 0;
    },

    snapshot(): { reads: number; searches: number; warningsEmitted: number } {
      return {
        reads: reads.length,
        searches: searches.length,
        warningsEmitted,
      };
    },
  };
}

function toStored(input: ReadObservation): StoredRead {
  return {
    pathId: input.pathId,
    offset: input.offset,
    limit: input.limit,
    raw: input.raw,
    sizeBytes: input.sizeBytes,
    mtimeMs: input.mtimeMs,
    contentFingerprint: input.contentFingerprint,
    truncated: input.truncated,
    suggestedNextOffset: input.suggestedNextOffset,
    turn: input.turn,
    warned: false,
  } as StoredRead;
}
