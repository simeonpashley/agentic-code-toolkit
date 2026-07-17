/**
 * Pricing-hints list formatter — pretty-prints the registry for display.
 *
 * Used by the `/pricing-list` slash command. Shows one row per
 * (provider, model) with the three-axis raw prices plus the computed
 * max-axis ratio vs M2.7 baseline, peak-hour annotations, and source.
 * The confirm dialog the command uses is scrollable, so both wide
 * rows and many rows fit.
 */
import type { Registry } from "./types.ts";
import { computeRatio, BASELINE_COST } from "./pricing.ts";

const KEY_WIDTH = 36;
const PRICE_WIDTH = 12;
const RATIO_WIDTH = 10;
const DATE_WIDTH = 11;
const URL_WIDTH = 36;

export function formatRegistryList(registry: Registry): string {
  const entries = Object.entries(registry);
  if (entries.length === 0) return "pricing: registry is empty";

  const rows: string[] = [];

  rows.push(
    "model".padEnd(KEY_WIDTH) +
      "  hit/M".padEnd(PRICE_WIDTH) +
      "  miss/M".padEnd(PRICE_WIDTH) +
      "  out/M".padEnd(PRICE_WIDTH) +
      "  ratio".padEnd(RATIO_WIDTH) +
      "  date".padEnd(DATE_WIDTH) +
      "  source",
  );
  rows.push(
    "-".repeat(
      KEY_WIDTH +
        (PRICE_WIDTH + 1) * 3 +
        RATIO_WIDTH +
        2 +
        DATE_WIDTH +
        2 +
        URL_WIDTH,
    ),
  );

  for (const [key, row] of entries.sort(([, a], [, b]) => {
    const ra = computeRatio(a.cost, BASELINE_COST).max_axis_ratio;
    const rb = computeRatio(b.cost, BASELINE_COST).max_axis_ratio;
    return ra - rb;
  })) {
    const c = row.cost;
    const r = computeRatio(row.cost, BASELINE_COST);
    const ratioStr =
      r.max_axis_ratio.toFixed(r.max_axis_ratio < 1 ? 2 : 1) + "x";
    const peak = row.peak_windows
      ? ` (peak ${row.peak_windows
          .filter((w) => w.from_h !== 0 || w.until_h !== 24)
          .map((w) => `${pad2(w.from_h)}-${pad2(w.until_h)}`)
          .join(", ")})`
      : "";
    const date = (row.date_modified ?? "").slice(0, 10);
    const url = (row.source_url ?? "").slice(0, URL_WIDTH);

    rows.push(
      key.padEnd(KEY_WIDTH) +
        "  " +
        c.input_cache_hit.toFixed(4).padStart(PRICE_WIDTH - 2) +
        "  " +
        c.input_cache_miss.toFixed(3).padStart(PRICE_WIDTH - 2) +
        "  " +
        c.output.toFixed(3).padStart(PRICE_WIDTH - 2) +
        "  " +
        ratioStr.padStart(RATIO_WIDTH - 2) +
        "  " +
        date.padEnd(DATE_WIDTH) +
        "  " +
        url +
        peak,
    );
  }

  return rows.join("\n");
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
