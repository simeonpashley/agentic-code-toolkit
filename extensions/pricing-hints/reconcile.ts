/**
 * Pricing-hints reconciliation — pure-ish.
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 *
 * Given the active model's runtime cost and the current registry,
 * decides whether to add a new entry (silent notify) or prompt the
 * user on drift (use cached / update from runtime). Returns the
 * resulting cost to render and any side effects performed.
 *
 * Side effects: writes to the registry file via the save callback
 * (atomic file IO) and may call the UI's select/notify methods. The
 * function itself is otherwise pure — same inputs produce the same
 * outputs.
 */
import type { Cost, Registry, Window } from "./types.ts";

export type ActiveModel = {
  provider: string;
  id: string;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
};

export type ReconcileUI = {
  select(title: string, options: string[]): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
};

export type ReconcileDeps = {
  ui: ReconcileUI;
  save: (registry: Registry) => void;
  now: Date;
};

export type ReconcileResult = {
  /** Updated registry (caller persists or discards). */
  registry: Registry;
  /** Cost to render. null when no pricing data is available. */
  cost: Cost | null;
  /** Peak-window schedule, if the row declares one. */
  peakWindows: Window[] | undefined;
  /** What kind of event happened, for testing/observability. */
  outcome: "added" | "kept-cached" | "updated-from-runtime" | "no-change";
};

export async function reconcile(
  model: ActiveModel,
  registry: Registry,
  deps: ReconcileDeps,
): Promise<ReconcileResult> {
  const key = `${model.provider}/${model.id}`;
  const runtimeCost = toEngineCost(model);
  const existing = registry[key];

  if (!existing) {
    // Cache miss: silently add from runtime, log via notify.
    const row = {
      cost: runtimeCost,
      last_seen: deps.now.toISOString(),
    };
    const next: Registry = { ...registry, [key]: row };
    deps.save(next);
    deps.ui.notify(`pricing: added ${key} to registry`, "info");
    return {
      registry: next,
      cost: runtimeCost,
      peakWindows: undefined,
      outcome: "added",
    };
  }

  if (!costEqual(existing.cost, runtimeCost)) {
    // Drift: prompt the user. The select returns the chosen option
    // string, or undefined if dismissed.
    const choice = await deps.ui.select(
      formatDriftTitle(key, existing.cost, runtimeCost),
      [
        "Use cached (your curated value)",
        "Update from runtime (the agent bundle's value)",
      ],
    );
    if (choice === "Update from runtime (the agent bundle's value)") {
      const next: Registry = {
        ...registry,
        [key]: {
          ...existing,
          cost: runtimeCost,
          date_modified: deps.now.toISOString(),
        },
      };
      deps.save(next);
      return {
        registry: next,
        cost: runtimeCost,
        peakWindows: existing.peak_windows,
        outcome: "updated-from-runtime",
      };
    }
    // "Use cached" or dismissed — keep the user's curated value.
    return {
      registry,
      cost: existing.cost,
      peakWindows: existing.peak_windows,
      outcome: "kept-cached",
    };
  }
  // Match. No file write — date_modified stays as it was. Returning
  // the same registry tells the caller nothing was saved.
  return {
    registry,
    cost: existing.cost,
    peakWindows: existing.peak_windows,
    outcome: "no-change",
  };
}

function toEngineCost(model: ActiveModel): Cost {
  return {
    input_cache_hit: model.cost.cacheRead,
    input_cache_miss: model.cost.input,
    output: model.cost.output,
  };
}

function costEqual(a: Cost, b: Cost): boolean {
  return (
    a.input_cache_hit === b.input_cache_hit &&
    a.input_cache_miss === b.input_cache_miss &&
    a.output === b.output
  );
}

/**
 * Format the drift prompt's title with both costs side-by-side so the
 * user can decide without remembering what was there.
 */
export function formatDriftTitle(
  key: string,
  cached: Cost,
  runtime: Cost,
): string {
  const fmt = (c: Cost) =>
    `  $${c.input_cache_hit.toFixed(4)}/$${c.input_cache_miss.toFixed(3)}/$${c.output.toFixed(3)} per 1M (hit/miss/out)`;
  return (
    `pricing: ${key} cost differs\n` +
    `  cached:  ${fmt(cached)}\n` +
    `  runtime: ${fmt(runtime)}`
  );
}
