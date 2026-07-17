/**
 * Pricing-hints engine — pure functions.
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 *
 * The engine takes a model cost (from `ctx.model.cost` in the runtime)
 * plus an optional peak-window schedule, and produces the rendered
 * status string. The baseline is MiniMax M2.7 (1.0x) per spec. The
 * verdict is max-of-three (pessimistic) so the user sees the worst
 * case the chosen model might hit.
 *
 * No I/O, no clock — every entry point takes `now` explicitly so tests
 * are deterministic.
 */
import type { Registry } from "./types.ts";
export type Axis = "cache_hit" | "cache_miss" | "output";

/**
 * The three prices the engine compares. All values in dollars per 1M
 * tokens. Mirrors `Model.cost` from `@earendil-works/pi-ai` but
 * shaped to what the engine actually reads.
 */
export type Cost = {
  input_cache_hit: number;
  input_cache_miss: number;
  output: number;
};

export type Window = {
  from_h: number;
  until_h: number;
  input_cache_hit: number;
  input_cache_miss: number;
  output: number;
};

export type LiveBalance = {
  amount_usd: number;
};

export type RatioVector = {
  cache_hit: number;
  cache_miss: number;
  output: number;
  max_axis_ratio: number;
  max_axis: Axis;
};

export type Verdict = "cheap" | "normal" | "expensive";

export const STATUS_KEY = "agentic-code-toolkit.pricing-hints";

/**
 * Baseline: MiniMax M2.7 (1.0x) per the spec. Sourced from
 * https://minimax-ai.chat/pricing/ (input $0.30, output $1.20,
 * cache_read $0.06). All Go-lineup models are referenced against
 * these numbers in the absence of a higher-quality baseline.
 */
export const BASELINE_COST: Cost = {
  input_cache_hit: 0.06,
  input_cache_miss: 0.3,
  output: 1.2,
};

/**
 * Resolve the window active at `now` (UTC). Walk the array in order;
 * first match wins. The 24h default at the bottom is what guarantees
 * resolution — every peak-windows array must end with
 * `{from_h: 0, until_h: 24}`.
 */
export function resolveWindow(windows: Window[], now: Date): Window {
  const h = now.getUTCHours();
  for (const w of windows) {
    if (h >= w.from_h && h < w.until_h) return w;
  }
  // Unreachable if the windows array ends with the 24h default.
  return windows[windows.length - 1]!;
}

function ratio(modelPrice: number, baselinePrice: number): number {
  if (baselinePrice === 0) return 0;
  return modelPrice / baselinePrice;
}

/**
 * Compute the per-axis ratios between a model's cost and the baseline,
 * plus the worst axis and its ratio. The verdict is determined by the
 * worst axis (pessimistic — flags the worst case the user might hit).
 */
export function computeRatio(model: Cost, baseline: Cost): RatioVector {
  const r_hit = ratio(model.input_cache_hit, baseline.input_cache_hit);
  const r_miss = ratio(model.input_cache_miss, baseline.input_cache_miss);
  const r_out = ratio(model.output, baseline.output);

  const axes: Array<[Axis, number]> = [
    ["cache_hit", r_hit],
    ["cache_miss", r_miss],
    ["output", r_out],
  ];
  let maxAxis: Axis = "cache_miss";
  let maxRatio = r_miss;
  for (const [axis, r] of axes) {
    if (r > maxRatio) {
      maxRatio = r;
      maxAxis = axis;
    }
  }

  return {
    cache_hit: r_hit,
    cache_miss: r_miss,
    output: r_out,
    max_axis_ratio: maxRatio,
    max_axis: maxAxis,
  };
}

/**
 * Map a max-axis ratio to a verdict label. Bands per spec:
 * ≤ 0.5x → cheap; > 0.5x and ≤ 2x → normal; > 2x → expensive.
 */
export function verdict(maxRatio: number): Verdict {
  if (maxRatio > 2) return "expensive";
  if (maxRatio > 0.5) return "normal";
  return "cheap";
}

/**
 * Apply peak windows to a base cost, returning the effective cost for
 * `now` along with whether a peak window is currently active. If
 * `peakWindows` is undefined or the active window is the always-on 24h
 * default, the base cost is returned unchanged.
 */
export function resolveActiveCost(
  base: Cost,
  peakWindows: Window[] | undefined,
  now: Date,
): { cost: Cost; isPeak: boolean } {
  if (!peakWindows || peakWindows.length === 0) {
    return { cost: base, isPeak: false };
  }
  const w = resolveWindow(peakWindows, now);
  const last = peakWindows[peakWindows.length - 1]!;
  const isPeak = w !== last;
  if (isPeak) {
    return {
      cost: {
        input_cache_hit: w.input_cache_hit,
        input_cache_miss: w.input_cache_miss,
        output: w.output,
      },
      isPeak: true,
    };
  }
  return { cost: base, isPeak: false };
}

// ── Until-hour helper ────────────────────────────────────────────────

/**
 * Find the nearest transition hour relative to `now`: when peak pricing
 * starts (if currently off-peak) or ends (if currently in peak).
 * Returns null if no peak windows are configured (no schedule to show).
 */
export function getUntilHour(
  peakWindows: Window[] | undefined,
  now: Date,
): number | null {
  if (!peakWindows || peakWindows.length === 0) return null;
  const h = now.getUTCHours();
  // Filter out the 24h default window — we only care about peak windows.
  const peaks = peakWindows.filter(
    (w) => !(w.from_h === 0 && w.until_h === 24),
  );
  if (peaks.length === 0) return null;

  // Check if currently inside a peak window.
  for (const w of peaks) {
    if (h >= w.from_h && h < w.until_h) {
      return w.until_h; // show when this peak ends
    }
  }

  // Not in peak — find the next peak window that starts after now.
  for (const w of peaks) {
    if (h < w.from_h) {
      return w.from_h; // show when next peak starts
    }
  }

  // All peaks passed for today — wrap to the first peak tomorrow.
  return peaks[0]!.from_h;
}
// ── Renderer ──────────────────────────────────────────────────────────

/**
 * Format a ratio for display. ≤ 1.0 shown with two decimals; > 1.0
 * shown with one decimal — sufficient resolution without crowding the
 * status line.
 */
function formatRatio(r: number): string {
  if (r < 1) return `${r.toFixed(2)}x`;
  return `${r.toFixed(1)}x`;
}

/**
 * Render the price element: `💰 <ratio> => HH:00` or `💰 <ratio> [PEAK] => HH:00`.
 *
 * The `💰` prefix is uniform across verdicts. Severity is carried by
 * the ratio number itself (smaller = cheaper, bigger = more expensive)
 * rather than by an emoji vocabulary. `isPeak` is true when the active
 * window is not the always-on 24h default.
 *
 * When in peak mode, `PEAK` is rendered in red (`\x1b[31m`) to catch
 * the user's attention against any ratio/verdict.
 *
 * `untilHour` is the hour (UTC) when the current pricing regime ends
 * (peak ends or off-peak ends and next peak starts). Null when no peak
 * schedule is configured for the model.
 */
export function renderPriceElement(
  ratio: RatioVector,
  _v: Verdict,
  isPeak: boolean,
  untilHour: number | null,
): string {
  const ratioStr = formatRatio(ratio.max_axis_ratio);
  let result = `💰 ${ratioStr}`;
  if (isPeak) {
    result += ` \x1b[31m[PEAK]\x1b[0m`;
  }
  if (untilHour !== null) {
    const hh = String(untilHour).padStart(2, "0");
    result += ` => ${hh}:00`;
  }
  return result;
}

/**
 * Render the budget element when live balance data is present.
 * Returns null when no live data — caller omits the element entirely.
 */
export function renderBudgetElement(
  balance: LiveBalance | null,
): string | null {
  if (!balance) return null;
  return `🪫 $${balance.amount_usd.toFixed(2)}`;
}

/**
 * Render cache usage incentive: how many times cheaper a cache hit is
 * vs a cache miss. Higher ratios mean more financial incentive to
 * structure prompts for cache hits. Returns "🎯 <ratio>x (<label>)".
 */
export function renderCacheUsage(cost: Cost): string {
  if (cost.input_cache_hit <= 0) return "🎯 ?x (no cache pricing)";
  const ratio = cost.input_cache_miss / cost.input_cache_hit;
  const label = ratio >= 10 ? "high" : ratio >= 3 ? "moderate" : "low";
  const ratioStr = ratio >= 10 ? `${ratio.toFixed(0)}` : `${ratio.toFixed(1)}`;
  return `🎯 ${ratioStr}x (${label})`;
}

/**
 * Top-level renderer.
 * `ctx.model.cost`) plus the peak-window schedule for that
 * (provider, model) pair, and composes the price + optional budget
 * elements. Returns `⚠ no pricing data` when the model has no cost
 * data — explicit warning, never silent.
 */
export function renderPricingStatus(
  _providerModel: string,
  modelCost: Cost | null,
  peakWindows: Window[] | undefined,
  now: Date,
  liveBalance?: LiveBalance | null,
): string {
  if (!modelCost) return "⚠ no pricing data";

  const { cost: activeCost, isPeak } = resolveActiveCost(
    modelCost,
    peakWindows,
    now,
  );
  const r = computeRatio(activeCost, BASELINE_COST);
  const v = verdict(r.max_axis_ratio);
  const untilHourUtc = getUntilHour(peakWindows, now);
  const untilHour =
    untilHourUtc !== null
      ? (((untilHourUtc - now.getTimezoneOffset() / 60) % 24) + 24) % 24
      : null;
  const price = renderPriceElement(r, v, isPeak, untilHour);
  const budget = renderBudgetElement(liveBalance ?? null);
  return budget ? `${price} · ${budget}` : price;
}

/**
 * Check if a model is currently in a peak pricing window.
 *
 * Returns true if the model has peak windows defined and the current time
 * falls within any peak window (not the default 24h window).
 *
 * @param provider - e.g. "deepseek"
 * @param modelId - e.g. "deepseek-v4-flash"
 * @param registry - The pricing registry (from loadCache or SEED)
 * @param now - Current time (for deterministic testing)
 */
export function isModelPeak(
  provider: string,
  modelId: string,
  registry: Registry,
  now: Date,
): boolean {
  const row = registry[`${provider}/${modelId}`];
  if (!row?.peak_windows || row.peak_windows.length === 0) return false;
  const { isPeak } = resolveActiveCost(row.cost, row.peak_windows, now);
  return isPeak;
}
