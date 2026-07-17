/**
 * Token hygiene metrics lifecycle.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md — "0. Durable metrics logger"
 *
 * Exports:
 *   createMetricsLogger(options)     — append-only JSONL logger with rotation
 *   readMetricsFile(path)            — parse JSONL, skip malformed lines
 *   deleteLocalMetrics(input)        — remove metrics files + retained dir
 *   cleanupExpiredMetrics(input)     — remove rotated files past retention
 */

import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export interface MetricsLogger {
  /** Append a single JSON event to the metrics file. Returns true on successful write, false otherwise. */
  log(event: Record<string, unknown>): boolean;
  /**
   * Release resources. Idempotent.
   * After shutdown, `log()` silently no-ops.
   */
  shutdown(): void;
}

export interface MetricsLoggerOptions {
  /** Full path to the current metrics JSONL file. */
  metricsPath: string;
  /**
   * Serialize (redact) an event before writing.
   * Return the redacted event or `null` to skip it entirely.
   * `options.identifierMode` reports the current config mode.
   */
  serializeMetricEvent: (
    event: Record<string, unknown>,
    options?: { identifierMode?: "hmac" | "clear-local-debug" },
  ) => Record<string, unknown> | null;
  /** Current identifier mode. Default: "hmac". */
  identifierMode?: "hmac" | "clear-local-debug";
  /** Rotate when the current file exceeds this many bytes. Default: 10_000_000. */
  maxBytesPerFile?: number;
  /** Maximum number of rotated files to keep. Default: 5. */
  maxFiles?: number;
  /** Retention period in days for rotated files. Default: 30. */
  retentionDays?: number;
  /** Optional callback invoked when a write fails. The extension can use this to surface a UI warning. */
  onWriteFailure?: (error: Error) => void;
}

export interface ParsedMetricRecord {
  lineNumber: number;
  data: Record<string, unknown>;
}

export interface MalformedLineInfo {
  lineNumber: number;
  raw: string;
}

export interface ReadMetricsResult {
  events: ParsedMetricRecord[];
  malformedLines: MalformedLineInfo[];
}

export interface DeleteMetricsInput {
  /** Full path to the current metrics JSONL file. */
  metricsPath: string;
  /** Optional directory of retained output files to remove. */
  retainedDir?: string;
}

export interface CleanupExpiredInput {
  /** Directory containing the metrics files. */
  metricsDir: string;
  /** Number of days after which a rotated file is considered expired. */
  retentionDays: number;
  /** Override "now" for deterministic testing. Defaults to `new Date()`. */
  now?: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────

const DEFAULT_MAX_BYTES_PER_FILE = 10_000_000;
const DEFAULT_MAX_FILES = 5;

/** Build a rotated filename like `metrics.1.jsonl` from `metrics.jsonl`. */
function rotatedPath(basePath: string, index: number): string {
  const dir = dirname(basePath);
  const base = basename(basePath, extname(basePath));
  return join(dir, `${base}.${index}.jsonl`);
}

/** Shift rotated files up by one position, removing the oldest if needed. */
function rotateFiles(metricsPath: string, maxFiles: number): void {
  // Delete the file that would fall outside the rotation window
  const toDelete = rotatedPath(metricsPath, maxFiles);
  if (existsSync(toDelete)) {
    unlinkSync(toDelete);
  }

  // Shift: N → N+1 (starting from the highest so we don't overwrite)
  for (let i = maxFiles - 1; i >= 1; i--) {
    const src = rotatedPath(metricsPath, i);
    if (existsSync(src)) {
      const dest = rotatedPath(metricsPath, i + 1);
      renameSync(src, dest);
    }
  }

  // Rename current → .1
  if (existsSync(metricsPath)) {
    const dest = rotatedPath(metricsPath, 1);
    renameSync(metricsPath, dest);
  }
}

/** Parse an ISO timestamp string into a Date. Returns null for invalid. */
function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// ── createMetricsLogger ───────────────────────────────────────────────

export function createMetricsLogger(
  options: MetricsLoggerOptions,
): MetricsLogger {
  const {
    metricsPath,
    serializeMetricEvent,
    maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE,
    maxFiles = DEFAULT_MAX_FILES,
    identifierMode = "hmac",
    onWriteFailure,
  } = options;

  let closed = false;
  let dirCreated = false;
  let wasClearMode = identifierMode === "clear-local-debug";
  return {
    log(event: Record<string, unknown>): boolean {
      if (closed) return false;
      // Track if the mode has been clear-local-debug at any point in this session.
      // Once the clear mode has been used, all events in this session are marked.
      if (identifierMode === "clear-local-debug") wasClearMode = true;

      // Serialize (redact) the event
      let serialized: Record<string, unknown> | null;
      try {
        serialized = serializeMetricEvent(event, { identifierMode });
      } catch {
        serialized = null;
      }
      if (serialized === null) return false; // redaction failure → skip

      // Mark the event as local-debug if the mode was ever clear in this session
      if (wasClearMode) {
        serialized.localDebug = true;
      }

      // Ensure timestamp
      if (!serialized.timestamp) {
        serialized.timestamp = new Date().toISOString();
      }

      // Serialize to JSON
      let line: string;
      try {
        line = JSON.stringify(serialized) + "\n";
      } catch {
        return false; // un-serializable event → skip
      }

      // Ensure parent directory exists (lazy — not at construction)
      // so write-failure test paths see the correct behaviour.
      if (!dirCreated) {
        try {
          const dir = dirname(metricsPath);
          if (dir && !existsSync(dir)) {
            mkdirSync(dir, { recursive: true, mode: 0o700 });
          }
          dirCreated = true;
        } catch {
          // Even if mkdir fails, attempt the write below
        }
      }

      // Check size and rotate if needed
      try {
        if (existsSync(metricsPath)) {
          const size = statSync(metricsPath).size;
          if (size >= maxBytesPerFile) {
            rotateFiles(metricsPath, maxFiles);
          }
        }
      } catch {
        // If size check or rotation fails, attempt the write anyway
      }

      // Append — apply 0600 permissions on first write
      try {
        const fileExisted = existsSync(metricsPath);
        appendFileSync(metricsPath, line, { flag: "a", mode: 0o600 });
        if (!fileExisted) {
          try {
            chmodSync(metricsPath, 0o600);
          } catch {
            /* platform may not support */
          }
        }
        return true;
      } catch (err) {
        // Write failure degrades gracefully — no throw. Caller may emit UI warning via onWriteFailure.
        if (onWriteFailure)
          onWriteFailure(err instanceof Error ? err : new Error(String(err)));
        return false;
      }
    },

    shutdown(): void {
      closed = true;
    },
  };
}

// ── readMetricsFile ────────────────────────────────────────────────────

export function readMetricsFile(path: string): ReadMetricsResult {
  const events: ParsedMetricRecord[] = [];
  const malformedLines: MalformedLineInfo[] = [];

  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    // File not found, permission error, etc.
    return { events, malformedLines };
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (trimmed === "") continue; // Skip blank lines

    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      events.push({ lineNumber: i + 1, data });
    } catch {
      malformedLines.push({ lineNumber: i + 1, raw });
    }
  }

  return { events, malformedLines };
}

// ── deleteLocalMetrics ─────────────────────────────────────────────────

export function deleteLocalMetrics(input: DeleteMetricsInput): void {
  const { metricsPath, retainedDir } = input;

  // Delete the current metrics file
  try {
    if (existsSync(metricsPath)) {
      unlinkSync(metricsPath);
    }
  } catch {
    // Graceful degradation
  }

  // Find and delete rotated files (metrics.N.jsonl)
  const dir = dirname(metricsPath);
  const base = basename(metricsPath, extname(metricsPath));
  const ext = extname(metricsPath);

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      // Match files like metrics.1.jsonl, metrics.2.jsonl, etc.
      const pattern = new RegExp(
        `^${escapeRegex(base)}\\.\\d+${escapeRegex(ext)}$`,
      );
      if (pattern.test(file)) {
        try {
          unlinkSync(join(dir, file));
        } catch {
          // Graceful per-file degradation
        }
      }
    }
  } catch {
    // Directory read failure — graceful
  }

  // Delete the retained directory if specified
  if (retainedDir) {
    try {
      if (existsSync(retainedDir)) {
        rmSync(retainedDir, { recursive: true, force: true });
      }
    } catch {
      // Graceful degradation
    }
  }
}

// ── cleanupExpiredMetrics ──────────────────────────────────────────────

export function cleanupExpiredMetrics(input: CleanupExpiredInput): void {
  const { metricsDir, retentionDays, now } = input;
  const cutoff =
    (now ?? new Date()).getTime() - retentionDays * 24 * 60 * 60 * 1000;

  let files: string[];
  try {
    files = readdirSync(metricsDir);
  } catch {
    return; // Directory missing or inaccessible — no-op
  }

  for (const file of files) {
    const fullPath = join(metricsDir, file);

    // Only process rotated metrics files (metrics.N.jsonl), not the current file
    const ext = extname(file);
    const base = basename(file, ext);
    const match = base.match(/^(.+)\.(\d+)$/);
    if (!match) continue; // Not a rotated file

    let fileDate: Date | null = null;

    // Try to parse the timestamp from the first JSON line
    try {
      const content = readFileSync(fullPath, "utf-8");
      const firstLine = content.split("\n")[0];
      if (firstLine) {
        const parsed = JSON.parse(firstLine) as Record<string, unknown>;
        fileDate = parseTimestamp(parsed.timestamp);
      }
    } catch {
      // If we can't read the file, use mtime as fallback
    }

    // Fallback: use file modification time
    if (!fileDate) {
      try {
        const st = statSync(fullPath);
        fileDate = st.mtime;
      } catch {
        continue; // Can't stat — skip
      }
    }

    if (fileDate.getTime() < cutoff) {
      try {
        unlinkSync(fullPath);
      } catch {
        // Graceful per-file degradation
      }
    }
  }
}

// ── Utilities ──────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
