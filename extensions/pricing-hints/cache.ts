/**
 * Pricing-hints cache — file IO for the persistent pricing registry.
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 *
 * Pure functions: take a path, return a parsed registry or write one.
 * Atomic writes via temp-file + rename so a partial write on crash
 * doesn't leave the user with a corrupted registry.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import type { Registry, RegistryRow } from "./types.ts";
import type { UsageRegistry } from "./usage-types.ts";
import { SEED } from "./seed.ts";
import { USAGE_SEED } from "./usage-seed.ts";
import { mergeWithSeed } from "./usage.ts";

export type LoadResult = {
  registry: Registry;
  /** true when the file didn't exist and the seed was returned. */
  isFresh: boolean;
};

/**
 * Read the registry from disk. If the file doesn't exist, return
 * the seed with `isFresh: true` so the caller can persist it.
 * If the file is corrupt, the error propagates — the user must fix
 * the JSON manually; we don't silently overwrite.
 *
 * Any row missing a `date_modified` gets the current time at load —
 * keeps the field universal across seeded, runtime-discovered, and
 * user-edited rows.
 */
export function loadCache(path: string, now: Date = new Date()): LoadResult {
  if (!existsSync(path)) {
    return { registry: clone(SEED), isFresh: true };
  }
  const raw = readFileSync(path, "utf-8");
  const raw2 = JSON.parse(raw) as Registry;
  const nowIso = now.toISOString();
  const registry: Registry = {};
  for (const [key, row] of Object.entries(raw2)) {
    registry[key] = { ...row, date_modified: row.date_modified ?? nowIso };
  }
  return { registry, isFresh: false };
}

/**
 * Write the registry to disk atomically. Creates parent directories
 * if they don't exist.
 */
export function saveCache(path: string, registry: Registry): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2) + "\n");
  renameSync(tmp, path);
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

// ── Usage cache ────────────────────────────────────────────────

/**
 * Load the usage registry from disk. If the file doesn't exist,
 * return the seed merged with any cached data we have.
 * Separate file from the pricing cache.
 */
export function loadUsageCache(path: string): UsageRegistry {
  if (!existsSync(path)) {
    return clone(USAGE_SEED);
  }
  const raw = readFileSync(path, "utf-8");
  const raw2 = JSON.parse(raw) as UsageRegistry;
  return mergeWithSeed(raw2);
}

/**
 * Write the usage registry to disk atomically.
 */
export function saveUsageCache(path: string, registry: UsageRegistry): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2) + "\n");
  renameSync(tmp, path);
}

// `RegistryRow` is referenced here so its import isn't dropped by a
// future refactor; it carries the row shape loadCache relies on.
export type _RegistryRow = RegistryRow;
