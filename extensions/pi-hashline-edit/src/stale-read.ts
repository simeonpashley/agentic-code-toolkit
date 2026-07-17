/**
 * Stale-read protection — mtime-based file change detection.
 *
 * Records file mtimeMs on every successful read, edit, and insert.
 * Checks before mutation whether the file changed since last recording.
 * Rejects with a re-read message when mtime has advanced.
 */
import { statSync as fsStatSync } from "node:fs";

// ─── In-memory marker store ───────────────────────────────────────────
const readMarkers = new Map<string, number>();

// ─── Public API ────────────────────────────────────────────────────────

/** Record file mtime after a successful read, edit, or insert. */
export function recordMtime(absPath: string): void {
  try {
    readMarkers.set(absPath, fsStatSync(absPath).mtimeMs);
  } catch (err: unknown) {
    // ENOENT: file deleted — safe to skip.
    // Other errors (EIO, ENOMEM, EACCES): systemic; marker absence allows
    // the edit through — the existing hash check is the ultimate safety net.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // Future: surface via ctx.ui.notify if systemic I/O failures detected.
    }
  }
}

/** Check whether a file changed since last recorded mtime.
 *  Returns a rejection message if stale, or undefined if safe to proceed. */
export function checkStale(
  absPath: string,
  displayPath: string,
): string | undefined {
  const lastRead = readMarkers.get(absPath);
  if (lastRead === undefined) {
    return `File has not been read yet: ${displayPath}. Use the read tool first — mutations require a prior read.`;
  }
  try {
    const current = fsStatSync(absPath).mtimeMs;
    if (current > lastRead) {
      return `File changed since last read: ${displayPath}. Re-read first.`;
    }
  } catch {
    // File gone — let the edit/insert handle it naturally
  }
  return undefined;
}

/** Clear all markers (called on session_compact). */
export function clearReadMarkers(): void {
  readMarkers.clear();
}

/** Exposed for testing only. */
export function _readMarkersForTesting(): ReadonlyMap<string, number> {
  return readMarkers;
}
