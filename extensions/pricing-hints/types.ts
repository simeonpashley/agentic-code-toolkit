/**
 * Pricing-hints shared types.
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 *
 * The pricing registry is the engine's source of truth. The runtime's
 * `ctx.model.cost` is only used to seed new entries and to detect drift.
 */

export type Cost = {
  /** $/1M tokens for cached input (re-using a previously-cached prefix) */
  input_cache_hit: number;
  /** $/1M tokens for fresh input (cache miss) */
  input_cache_miss: number;
  /** $/1M tokens for generated output */
  output: number;
};

/**
 * A time-windowed pricing schedule. Used for peak/valley pricing on
 * top of a row's base cost. The last window must be the always-on 24h
 * default at the regular rate.
 */
export type Window = {
  from_h: number;
  until_h: number;
  input_cache_hit: number;
  input_cache_miss: number;
  output: number;
};

/**
 * One row in the registry. Keyed by canonical `provider/modelId`.
 *
 * The user's curated source of truth: the engine reads `cost` (and
 * `peak_windows` if present) directly from here. The runtime's
 * `ctx.model.cost` is consulted only when a key is missing or when
 * the runtime and registry disagree (drift prompt).
 */
export type RegistryRow = {
  cost: Cost;
  source_url?: string;
  /**
   * ISO timestamp. Set when the row is created (auto-populated from
   * runtime) or last modified (drift prompt accepted, manual edit).
   * Not touched on read or on no-change-match — a stale date is a
   * useful signal that the row is past its freshness window.
   */
  date_modified?: string;
  /** Optional time-based pricing overrides (e.g., DeepSeek V4 peak). */
  peak_windows?: Window[];
};

export type Registry = Record<string, RegistryRow>;
