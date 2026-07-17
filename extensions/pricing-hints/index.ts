/**
 * Pricing-hints status bar extension with usage/limits tracking.
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 *
 * The pricing registry is the engine's source of truth. The runtime's
 * `ctx.model.cost` is consulted only when a (provider, model) row is
 * missing from the registry (silent add + notify) or when the runtime
 * and registry disagree (drift prompt).
 *
 * On first run, if `~/.pi/agent/pricing-cache.json` doesn't exist, the
 * seed in `seed.ts` is written to it. After that, the user's file is
 * authoritative — they can edit it directly, or accept drift prompts
 * to update from the runtime.
 *
 * Usage/limits data lives in a separate `~/.pi/agent/usage-cache.json`.
 * The `/usage` command shows a formatted report. Status bar shows a
 * compact indicator when approaching limits.
 *
 * Lifecycle contract: the 30-second refresh timer registered in
 * `session_start` MUST be cleared on `session_shutdown`. Once a session
 * is replaced (newSession / fork / switchSession / reload) or the agent
 * is quitting, the framework invalidates the captured ctx, and the next
 * tick of an uncleared timer would throw from the ctx.ui getter
 * (`assertActive` in @earendil-works/pi-coding-agent's ExtensionRunner).
 */
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  renderPricingStatus,
  STATUS_KEY,
  computeRatio,
  BASELINE_COST,
} from "./pricing.ts";
import { type Registry } from "./types.ts";
import {
  loadCache,
  saveCache,
  loadUsageCache,
  saveUsageCache,
} from "./cache.ts";
import { reconcile, type ActiveModel } from "./reconcile.ts";
import { formatRegistryList } from "./format.ts";
import {
  formatUsageReport,
  fetchProviderUsage,
  renderUsageStatusBar,
} from "./usage.ts";
import type { UsageRegistry } from "./usage-types.ts";

const REGISTRY_PATH = join(homedir(), ".pi", "agent", "pricing-cache.json");
const USAGE_PATH = join(homedir(), ".pi", "agent", "usage-cache.json");

export default function (pi: ExtensionAPI) {
  let registry: Registry = {};
  let usageRegistry: UsageRegistry = {};
  let initialized = false;
  let currentModel: ActiveModel | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let sessionGeneration = 0;
  function ensureLoaded() {
    if (initialized) return;
    initialized = true;
    const { registry: r, isFresh } = loadCache(REGISTRY_PATH);
    registry = r;
    if (isFresh) {
      try {
        saveCache(REGISTRY_PATH, registry);
      } catch {
        // Best-effort. Subsequent reads still work; just the first
        // persist didn't happen. Don't crash the agent.
      }
    }
    // Load usage cache (separate file, best-effort)
    try {
      usageRegistry = loadUsageCache(USAGE_PATH);
    } catch {
      // Corrupt or missing file — seed data is used as fallback.
    }
  }

  function persist() {
    try {
      saveCache(REGISTRY_PATH, registry);
    } catch {
      // The next model_select will re-detect drift; the user can
      // decide then. Don't crash on a write failure.
    }
  }

  function render(model: ActiveModel) {
    ensureLoaded();
    const providerModel = `${model.provider}/${model.id}`;
    const row = registry[providerModel];
    if (!row) {
      return "⚠ no pricing data";
    }
    const r = computeRatio(row.cost, BASELINE_COST);
    const status = renderPricingStatus(
      providerModel,
      row.cost,
      row.peak_windows,
      new Date(),
    );
    // Append usage indicator when approaching limits
    const usageParts: string[] = [];
    for (const [_key, entry] of Object.entries(usageRegistry)) {
      const part = renderUsageStatusBar(entry);
      if (part) usageParts.push(part);
    }
    const combined =
      usageParts.length > 0 ? `${status} | ${usageParts.join(" · ")}` : status;
    return colorRatio(combined, r.max_axis_ratio);
  }

  async function reconcileAndSet(model: ActiveModel, ctx: { ui: unknown }) {
    const result = await reconcile(model, registry, {
      // Cast: the agent's UI type is wider than our ReconcileUI
      // subset; the methods we use (select, notify) are present.
      ui: ctx.ui as never,
      save: (r: Registry) => {
        registry = r;
        persist();
      },
      now: new Date(),
    });
    registry = result.registry;
  }

  // Color the status output based on how expensive the ratio is.
  // < 0.5 → green (cheap). >= 5 → orange. >= 10 → red bg + white fg.
  // ANSI codes pass through sanitizeStatusText (no stripping) and are
  // rendered by the terminal or ignored if unsupported.
  function colorRatio(status: string, ratio: number): string {
    if (ratio >= 10) return `\x1b[41m\x1b[37m${status}\x1b[0m`;
    if (ratio >= 5) return `\x1b[38;5;208m${status}\x1b[0m`;
    if (ratio < 0.5) return `\x1b[32m${status}\x1b[0m`;
    return status;
  }
  pi.on("session_start", async (_event, ctx) => {
    ensureLoaded();
    // Bump generation so any queued callbacks from a previous session
    // detect they are stale before touching the captured ctx.
    sessionGeneration++;
    const gen = sessionGeneration;

    const model = ctx.model as ActiveModel | undefined;
    if (model) {
      currentModel = model;
      await reconcileAndSet(model, ctx);
      // If the session was replaced while reconcile was awaiting user
      // input (drift prompt), ctx is stale.  Check before touching it.
      if (sessionGeneration !== gen) return;
      ctx.ui.setStatus(STATUS_KEY, render(model));
    }

    // Refresh every 30s so peak/off-peak transitions are picked up.
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      // Guard: if session was replaced or shut down since this
      // callback was queued, clean up silently.  The generation check
      // runs before any ctx access, avoiding the assertActive throw.
      if (sessionGeneration !== gen) {
        clearInterval(refreshTimer!);
        refreshTimer = null;
        return;
      }
      try {
        if (currentModel) {
          ctx.ui.setStatus(STATUS_KEY, render(currentModel));
        }
      } catch {
        // Defense-in-depth: should be unreachable with the generation
        // guard above, but clean up anyway rather than crashing pi.
        if (refreshTimer) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
      }
    }, 30_000);
  });

  pi.on("session_shutdown", () => {
    // Bump generation first so any callback already queued in the
    // event loop will see the mismatch and return before touching ctx.
    sessionGeneration++;
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  });

  pi.on("model_select", async (event, ctx) => {
    ensureLoaded();
    const model = event.model as ActiveModel;
    currentModel = model;
    // Capture generation before the await so we can detect session
    // replacement during the drift-prompt reconcile.
    const gen = sessionGeneration;
    await reconcileAndSet(model, ctx);
    if (sessionGeneration !== gen) return;
    ctx.ui.setStatus(STATUS_KEY, render(model));
  });

  // Slash command: pretty-print the registry. Renders as a confirm
  // dialog body (the TUI equivalent of inline stdout); the user
  // dismisses with OK. No persistent widget, no status line hoarding.
  pi.registerCommand("pricing-list", {
    description: "Show all pricing registry rows with cost ratio vs baseline.",
    handler: async (_args, ctx) => {
      ensureLoaded();
      const text = formatRegistryList(registry);
      await ctx.ui.confirm("Pricing list", text);
    },
  });

  // Slash command: show usage/limits report with optional live fetch.
  // Renders as a confirm dialog body (TUI equivalent of inline stdout).
  pi.registerCommand("usage", {
    description:
      "Show usage and limits report per provider. Use --fetch (or -f) to query provider APIs.",
    handler: async (args, ctx) => {
      ensureLoaded();

      if (args === "--fetch" || args === "-f") {
        ctx.ui.notify("Fetching usage from provider APIs...", "info");
        for (const [_key, entry] of Object.entries(usageRegistry)) {
          if (!entry.fetch_config) continue;
          ctx.ui.notify(`  ${entry.label}...`, "info");
          const result = await fetchProviderUsage(entry.fetch_config);
          if (result) {
            if (result.usage.input_tokens !== undefined)
              entry.usage.input_tokens = result.usage.input_tokens;
            if (result.usage.output_tokens !== undefined)
              entry.usage.output_tokens = result.usage.output_tokens;
            if (result.usage.requests !== undefined)
              entry.usage.requests = result.usage.requests;
            if (result.limits.monthly_budget_usd !== undefined)
              entry.limits.monthly_budget_usd =
                result.limits.monthly_budget_usd;
            if (result.limits.rpm !== undefined)
              entry.limits.rpm = result.limits.rpm;
            entry.fetch_config.last_fetched = new Date().toISOString();
          }
        }
        try {
          saveUsageCache(USAGE_PATH, usageRegistry);
        } catch {
          // Best-effort
        }
      }

      const text = formatUsageReport(usageRegistry);
      await ctx.ui.confirm("Usage report", text);
    },
  });
}
