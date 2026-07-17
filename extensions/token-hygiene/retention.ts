/**
 * Retention — large tool_result → retained temp file.
 *
 * Extends the token-hygiene retention infrastructure. Output > threshold
 * is written to .pi/token-hygiene-retained/ with sanitized filenames,
 * restricted permissions, and atomic writes. The model-visible content
 * is replaced with a pointer.
 */
import { mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { TokenHygieneConfig } from "./types";

// ─── Path sanitization ──────────────────────────────────────────────────

function sanitizePathSegment(segment: string, maxLen: number): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, maxLen);
}

// ─── Dir management ─────────────────────────────────────────────────────

export function ensureRetentionDir(cwd: string): string {
  const dir = join(cwd, ".pi", "token-hygiene-retained");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Delete all retained files at session start (crash sweep). */
export function sweepRetainedFiles(cwd: string): void {
  try {
    rmSync(join(cwd, ".pi", "token-hygiene-retained"), {
      recursive: true,
      force: true,
    });
  } catch {
    /* directory may not exist */
  }
}

// ─── Retain single output ───────────────────────────────────────────────

export function retainToolOutput(
  toolName: string,
  toolCallId: string,
  content: string,
  cwd: string,
): string | undefined {
  try {
    const dir = ensureRetentionDir(cwd);
    const sanitizedTool = sanitizePathSegment(toolName, 32);
    const sanitizedId = sanitizePathSegment(toolCallId, 12);
    const filename = `${sanitizedTool}-${sanitizedId}.txt`;
    const filePath = join(dir, filename);
    const tmpPath = `${filePath}.tmp`;

    // Atomic write: write to temp, then rename
    writeFileSync(tmpPath, content, { mode: 0o600, flag: "wx" });
    renameSync(tmpPath, filePath);
    return filePath;
  } catch {
    // Disk full, permissions, path conflict — return undefined
    return undefined;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────

let retentionWriteFailed = false;

export function maybeRetainToolResult(
  event: any,
  config: TokenHygieneConfig,
  cwd: string,
  notify?: (msg: string, level: string) => void,
): any | undefined {
  if (event.isError) return undefined; // never retain errors
  if (!Array.isArray(event.content) || event.content.length === 0)
    return undefined;
  const first = event.content[0];
  if (!first || first.type !== "text" || typeof first.text !== "string")
    return undefined;

  const threshold =
    config.retainOutputPerToolThresholds?.[event.toolName] ??
    config.retainOutputThreshold;
  if (first.text.length <= threshold) return undefined;

  const filePath = retainToolOutput(
    event.toolName,
    event.toolCallId,
    first.text,
    cwd,
  );
  if (!filePath) {
    if (!retentionWriteFailed) {
      retentionWriteFailed = true;
      notify?.(
        "Token hygiene: failed to retain large output (disk full or permissions).",
        "warning",
      );
    }
    return undefined;
  }

  return {
    ...event,
    content: [{ type: "text", text: `[Output retained to ${filePath}]` }],
    _retained: true,
  };
}
