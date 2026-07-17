/**
 * Pricing-hints tests — registry cache + reconciliation logic.
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCache, saveCache } from "../extensions/pricing-hints/cache.ts";
import { formatRegistryList } from "../extensions/pricing-hints/format.ts";
import { formatDriftTitle } from "../extensions/pricing-hints/reconcile.ts";
import { SEED } from "../extensions/pricing-hints/seed.ts";
import {
  reconcile,
  type ReconcileUI,
} from "../extensions/pricing-hints/reconcile.ts";
import {
  resolveWindow,
  computeRatio,
  verdict,
  renderPriceElement,
  renderPricingStatus,
  renderCacheUsage,
  BASELINE_COST,
  STATUS_KEY,
  isModelPeak,
} from "../extensions/pricing-hints/pricing.ts";
import {
  type Cost,
  type Registry,
  type Window,
} from "../extensions/pricing-hints/types.ts";

let tmp: string;
let cachePath: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "pricing-hints-"));
  cachePath = join(tmp, "pricing-cache.json");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ── cache.ts ─────────────────────────────────────────────────────────

describe("loadCache", () => {
  it("returns the seed with isFresh=true when the file doesn't exist", () => {
    const r = loadCache(cachePath);
    expect(r.isFresh).toBe(true);
    expect(r.registry).toEqual(SEED);
  });

  it("returns the parsed registry with isFresh=false when the file exists", () => {
    const custom: Registry = {
      "test/test-model": {
        cost: { input_cache_hit: 0.01, input_cache_miss: 0.1, output: 1.0 },
      },
    };
    writeFileSync(cachePath, JSON.stringify(custom));
    const r = loadCache(cachePath);
    expect(r.isFresh).toBe(false);
    // loadCache fills in date_modified if missing, so the loaded
    // row will have the default timestamp applied.
    expect(r.registry["test/test-model"]!.cost).toEqual(
      custom["test/test-model"]!.cost,
    );
  });

  it("throws on corrupted JSON", () => {
    writeFileSync(cachePath, "{ this is not json");
    expect(() => loadCache(cachePath)).toThrow();
  });

  it("defaults missing date_modified to the load time", () => {
    const userRow = {
      cost: { input_cache_hit: 0.01, input_cache_miss: 0.1, output: 1.0 },
      source_url: "https://example.com",
    };
    writeFileSync(cachePath, JSON.stringify({ "user/manual": userRow }));
    const fixed = new Date("2026-08-15T12:00:00Z");
    const r = loadCache(cachePath, fixed);
    expect(r.registry["user/manual"]!.date_modified).toBe(
      "2026-08-15T12:00:00.000Z",
    );
  });

  it("preserves an existing date_modified on load", () => {
    const stamped = {
      cost: { input_cache_hit: 0.01, input_cache_miss: 0.1, output: 1.0 },
      date_modified: "2025-12-01T00:00:00.000Z",
    };
    writeFileSync(cachePath, JSON.stringify({ "user/old": stamped }));
    const r = loadCache(cachePath, new Date("2026-08-15T12:00:00Z"));
    expect(r.registry["user/old"]!.date_modified).toBe(
      "2025-12-01T00:00:00.000Z",
    );
  });
});

describe("saveCache", () => {
  it("writes the registry as pretty-printed JSON with a trailing newline", () => {
    const r: Registry = {
      "x/y": {
        cost: { input_cache_hit: 0.01, input_cache_miss: 0.1, output: 1.0 },
      },
    };
    saveCache(cachePath, r);
    const raw = readFileSync(cachePath, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain('"x/y"');
    expect(JSON.parse(raw)).toEqual(r);
  });

  it("creates parent directories if they don't exist", () => {
    const nestedPath = join(tmp, "a", "b", "c", "cache.json");
    saveCache(nestedPath, {});
    expect(existsSync(nestedPath)).toBe(true);
  });
});

// ── reconcile.ts ─────────────────────────────────────────────────────

function makeModel(cost: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}) {
  return {
    provider: "minimax",
    id: "MiniMax-M3",
    cost,
  };
}

function fakeUI(): {
  ui: ReconcileUI;
  calls: { selects: string[]; notifies: string[] };
} {
  const calls = { selects: [] as string[], notifies: [] as string[] };
  return {
    calls,
    ui: {
      select: async (title: string, _options: string[]) => {
        calls.selects.push(title);
        return undefined; // dismissed
      },
      notify: (msg: string) => {
        calls.notifies.push(msg);
      },
    },
  };
}

describe("reconcile", () => {
  it("silently adds a new model on cache miss and notifies", async () => {
    const registry: Registry = {};
    const f = fakeUI();
    const result = await reconcile(
      makeModel({ input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 }),
      registry,
      { ui: f.ui, save: () => {}, now: new Date("2026-07-03T14:00:00Z") },
    );
    expect(result.outcome).toBe("added");
    expect(result.cost).toEqual({
      input_cache_hit: 0.06,
      input_cache_miss: 0.3,
      output: 1.2,
    });
    expect(f.calls.notifies.length).toBe(1);
    expect(f.calls.notifies[0]).toContain("added minimax/MiniMax-M3");
    expect(f.calls.selects.length).toBe(0);
  });

  it("is a no-op when cached cost matches runtime cost", async () => {
    const cost: Cost = {
      input_cache_hit: 0.06,
      input_cache_miss: 0.3,
      output: 1.2,
    };
    const registry: Registry = { "minimax/MiniMax-M3": { cost } };
    const f = fakeUI();
    const result = await reconcile(
      makeModel({ input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 }),
      registry,
      { ui: f.ui, save: () => {}, now: new Date("2026-07-03T14:00:00Z") },
    );
    expect(result.outcome).toBe("no-change");
    expect(f.calls.selects.length).toBe(0);
    expect(f.calls.notifies.length).toBe(0);
  });

  it("prompts on drift; keeping cached returns the cached value", async () => {
    const cached: Cost = {
      input_cache_hit: 0.06,
      input_cache_miss: 0.3,
      output: 1.2,
    };
    const runtime: Cost = {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: 0,
    }; // pre-discount
    const registry: Registry = { "minimax/MiniMax-M3": { cost: cached } };
    const f = fakeUI();
    const result = await reconcile(makeModel(runtime), registry, {
      ui: f.ui,
      save: () => {},
      now: new Date("2026-07-03T14:00:00Z"),
    });
    expect(result.outcome).toBe("kept-cached");
    expect(result.cost).toEqual(cached);
    expect(f.calls.selects.length).toBe(1);
    expect(f.calls.selects[0]).toContain("cost differs");
  });

  it("prompts on drift; updating returns the runtime value", async () => {
    const cached: Cost = {
      input_cache_hit: 0.06,
      input_cache_miss: 0.3,
      output: 1.2,
    };
    const runtime: Cost = {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: 0,
    };
    const registry: Registry = { "minimax/MiniMax-M3": { cost: cached } };
    const f: ReturnType<typeof fakeUI> = {
      calls: { selects: [], notifies: [] },
      ui: {
        select: async () => "Update from runtime (the agent bundle's value)",
        notify: () => {},
      },
    };
    const result = await reconcile(makeModel(runtime), registry, {
      ui: f.ui,
      save: () => {},
      now: new Date("2026-07-03T14:00:00Z"),
    });
    expect(result.outcome).toBe("updated-from-runtime");
    expect(result.cost).toEqual({
      input_cache_hit: 0.12,
      input_cache_miss: 0.6,
      output: 2.4,
    });
  });

  it("dismissed prompt keeps cached value", async () => {
    const cached: Cost = {
      input_cache_hit: 0.06,
      input_cache_miss: 0.3,
      output: 1.2,
    };
    const runtime: Cost = {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: 0,
    };
    const registry: Registry = { "minimax/MiniMax-M3": { cost: cached } };
    const f = fakeUI();
    // fakeUI returns undefined (dismissed) by default
    const result = await reconcile(makeModel(runtime), registry, {
      ui: f.ui,
      save: () => {},
      now: new Date("2026-07-03T14:00:00Z"),
    });
    expect(result.outcome).toBe("kept-cached");
    expect(result.cost).toEqual(cached);
  });
});

// ── seed.ts (data correctness) ──────────────────────────────────────

describe("SEED registry", () => {
  it("has a baseline 1.0x entry for minimax/m2.7", () => {
    const r = computeRatio(SEED["minimax/m2.7"]!.cost, BASELINE_COST);
    expect(r.max_axis_ratio).toBeCloseTo(1.0, 5);
  });

  it("renders minimax/m2.7 as 💰 1.0x baseline", () => {
    const s = renderRegistryStatus("minimax/m2.7");
    expect(s).toMatch(/💰/);
    expect(s).toContain("1.0x");
  });

  it("renders deepseek/deepseek-v4-flash as cheap (~0.5x)", () => {
    const s = renderRegistryStatus("deepseek/deepseek-v4-flash");
    expect(s).toContain("0.47x");
  });

  it("renders deepseek/deepseek-v4-pro as above-baseline at regular hours", () => {
    const s = renderRegistryStatus("deepseek/deepseek-v4-pro");
    expect(s).toContain("1.4x");
    expect(s).not.toContain("peak");
  });

  it("renders deepseek/deepseek-v4-pro with (peak) during peak hours", () => {
    const s = renderRegistryStatus(
      "deepseek/deepseek-v4-pro",
      "2026-07-03T02:00:00Z",
    );
    expect(s).toContain("2.9x");
    expect(s).toContain("PEAK");
  });

  it("renders opencode-go/qwen3.7-max as expensive", () => {
    const s = renderRegistryStatus("opencode-go/qwen3.7-max");
    expect(s).toContain("8.3x");
  });

  it("renders opencode/gpt-5.5 as expensive at 25x", () => {
    const s = renderRegistryStatus("opencode/gpt-5.5");
    expect(s).toContain("25.0x");
  });
});

// Helper: render a registry status without going through the engine,
// so we can assert on the seed data's cost shaping.
function renderRegistryStatus(
  providerModel: string,
  nowIso = "2026-07-03T14:00:00Z",
): string {
  const row = SEED[providerModel];
  if (!row) return "⚠ no pricing data";
  return renderPricingStatus(
    providerModel,
    row.cost,
    row.peak_windows,
    new Date(nowIso),
  );
}

// ── pricing.ts engine (unchanged) ───────────────────────────────────

describe("resolveWindow", () => {
  it("matches the only window at UTC 14:00", () => {
    const single: Window[] = [
      {
        from_h: 0,
        until_h: 24,
        input_cache_hit: 0.06,
        input_cache_miss: 0.3,
        output: 1.2,
      },
    ];
    const at = new Date("2026-07-03T14:00:00Z");
    expect(resolveWindow(single, at)).toBe(single[0]);
  });

  it("matches peak windows for DeepSeek V4 Pro at UTC 02:00 and 06:30", () => {
    const windows = SEED["deepseek/deepseek-v4-pro"]!.peak_windows!;
    expect(resolveWindow(windows, new Date("2026-07-03T02:00:00Z"))).toBe(
      windows[0],
    );
    expect(resolveWindow(windows, new Date("2026-07-03T06:30:00Z"))).toBe(
      windows[1],
    );
  });

  it("falls through to the 24h default outside peaks", () => {
    const windows = SEED["deepseek/deepseek-v4-pro"]!.peak_windows!;
    expect(resolveWindow(windows, new Date("2026-07-03T14:00:00Z"))).toBe(
      windows[2],
    );
  });
});

describe("computeRatio", () => {
  it("returns 1.0x on every axis when the model IS the baseline", () => {
    const r = computeRatio(SEED["minimax/m2.7"]!.cost, BASELINE_COST);
    expect(r.max_axis_ratio).toBeCloseTo(1.0, 5);
  });

  it("renders MiniMax-M3 (currently identical to M2.7) as 1.0x normal", () => {
    const r = computeRatio(SEED["minimax/MiniMax-M3"]!.cost, BASELINE_COST);
    expect(r.max_axis_ratio).toBeCloseTo(1.0, 5);
    expect(verdict(r.max_axis_ratio)).toBe("normal");
  });

  it("renders DeepSeek V4 Pro at peak (max ~2.9x → expensive)", () => {
    const peakCost: Cost = SEED["deepseek/deepseek-v4-pro"]!
      .peak_windows![0] as Cost;
    const r = computeRatio(peakCost, BASELINE_COST);
    expect(r.cache_miss).toBeCloseTo(2.9, 1);
    expect(r.max_axis_ratio).toBeCloseTo(2.9, 1);
    expect(verdict(r.max_axis_ratio)).toBe("expensive");
  });

  it("renders gpt-5.5 as expensive: max axis is output at 25x", () => {
    const r = computeRatio(SEED["opencode/gpt-5.5"]!.cost, BASELINE_COST);
    expect(r.output).toBeCloseTo(25, 1);
    expect(r.max_axis).toBe("output");
    expect(r.max_axis_ratio).toBeCloseTo(25, 1);
    expect(verdict(r.max_axis_ratio)).toBe("expensive");
  });
});

describe("renderPriceElement", () => {
  it("renders the uniform 💰 prefix across verdicts", () => {
    const cheap: Cost = {
      input_cache_hit: 0.02,
      input_cache_miss: 0.2,
      output: 0.8,
    };
    const r1 = computeRatio(cheap, BASELINE_COST);
    expect(renderPriceElement(r1, verdict(r1.max_axis_ratio), false)).toMatch(
      /💰/,
    );

    const expensive: Cost = {
      input_cache_hit: 0.2,
      input_cache_miss: 2.0,
      output: 8.0,
    };
    const r2 = computeRatio(expensive, BASELINE_COST);
    expect(renderPriceElement(r2, verdict(r2.max_axis_ratio), false)).toMatch(
      /💰/,
    );
  });

  it("includes PEAK suffix during peak hours", () => {
    const peak: Cost = {
      input_cache_hit: 0.2,
      input_cache_miss: 2.0,
      output: 8.0,
    };
    const r = computeRatio(peak, BASELINE_COST);
    const s = renderPriceElement(r, verdict(r.max_axis_ratio), true);
    expect(s).toContain("PEAK");
  });
});

describe("renderCacheUsage", () => {
  it("shows small cache incentive when hit/miss prices are close", () => {
    // Baseline MiniMax M2.7: $0.06 hit, $0.30 miss → 5x
    const out = renderCacheUsage(BASELINE_COST);
    expect(out).toMatch(/🎯/);
    expect(out).toContain("5.0x");
  });

  it("shows high cache incentive when miss is much more expensive than hit", () => {
    // DeepSeek V4 Flash: $0.0028 hit, $0.14 miss → 50x
    const cost: Cost = {
      input_cache_hit: 0.0028,
      input_cache_miss: 0.14,
      output: 0.28,
    };
    const out = renderCacheUsage(cost);
    expect(out).toContain("50");
  });

  it("shows no cache incentive when hit and miss are equal", () => {
    // If cache doesn't save money, there's no incentive
    const cost: Cost = {
      input_cache_hit: 0.3,
      input_cache_miss: 0.3,
      output: 1.0,
    };
    const out = renderCacheUsage(cost);
    expect(out).toMatch(/1\.0x|1x/);
  });

  it("handles zero cache_hit price without dividing by zero", () => {
    const cost: Cost = {
      input_cache_hit: 0,
      input_cache_miss: 0.3,
      output: 1.0,
    };
    expect(() => renderCacheUsage(cost)).not.toThrow();
  });

  it("incentive label scales: ≥10x as 'high', ≥3x as 'moderate', else 'low'", () => {
    const high: Cost = {
      input_cache_hit: 0.01,
      input_cache_miss: 0.3,
      output: 1.0,
    };
    const mod: Cost = {
      input_cache_hit: 0.06,
      input_cache_miss: 0.3,
      output: 1.0,
    };
    const low: Cost = {
      input_cache_hit: 0.3,
      input_cache_miss: 0.6,
      output: 1.0,
    };
    expect(renderCacheUsage(high)).toMatch(/high/i);
    expect(renderCacheUsage(mod)).toMatch(/moderate/i);
    expect(renderCacheUsage(low)).toMatch(/low/i);
  });
});

// ── constants ─────────────────────────────────────────────────────────

describe("module constants", () => {
  it("exposes a baseline cost (1.0x reference)", () => {
    expect(BASELINE_COST).toEqual({
      input_cache_hit: 0.06,
      input_cache_miss: 0.3,
      output: 1.2,
    });
  });

  it("exposes a namespaced status key", () => {
    expect(STATUS_KEY).toBe("agentic-code-toolkit.pricing-hints");
  });
});

// ── formatRegistryList ────────────────────────────────────────────────

describe("formatRegistryList", () => {
  it("returns an empty-registry message when no rows", () => {
    expect(formatRegistryList({})).toBe("pricing: registry is empty");
  });

  it("renders one row per (provider, model) with the three prices and ratio", () => {
    const out = formatRegistryList({
      "minimax/m2.7": {
        cost: { input_cache_hit: 0.06, input_cache_miss: 0.3, output: 1.2 },
      },
    });
    expect(out).toContain("minimax/m2.7");
    expect(out).toContain("0.0600"); // hit
    expect(out).toContain("0.300"); // miss
    expect(out).toContain("1.200"); // out
    expect(out).toContain("1.0x"); // ratio vs baseline
  });

  it("annotates rows with peak windows, excluding the always-on 24h default", () => {
    const out = formatRegistryList({
      "deepseek/deepseek-v4-pro": {
        cost: {
          input_cache_hit: 0.003625,
          input_cache_miss: 0.435,
          output: 0.87,
        },
        peak_windows: [
          {
            from_h: 1,
            until_h: 4,
            input_cache_hit: 1,
            input_cache_miss: 1,
            output: 1,
          },
          {
            from_h: 6,
            until_h: 10,
            input_cache_hit: 1,
            input_cache_miss: 1,
            output: 1,
          },
          {
            from_h: 0,
            until_h: 24,
            input_cache_hit: 1,
            input_cache_miss: 1,
            output: 1,
          },
        ],
      },
    });
    expect(out).toContain("(peak 01-04, 06-10)");
  });
});

// ── formatDriftTitle ─────────────────────────────────────────────────

describe("formatDriftTitle", () => {
  it("shows both costs side-by-side with hit/miss/out labels", () => {
    const cached: Cost = {
      input_cache_hit: 0.06,
      input_cache_miss: 0.3,
      output: 1.2,
    };
    const runtime: Cost = {
      input_cache_hit: 0.12,
      input_cache_miss: 0.6,
      output: 2.4,
    };
    const out = formatDriftTitle("minimax/MiniMax-M3", cached, runtime);
    expect(out).toContain("minimax/MiniMax-M3");
    expect(out).toContain("cached:");
    expect(out).toContain("runtime:");
    expect(out).toContain("(hit/miss/out)");
    expect(out).toContain("0.0600");
    expect(out).toContain("0.300");
    expect(out).toContain("1.200");
    expect(out).toContain("0.1200");
    expect(out).toContain("0.600");
    expect(out).toContain("2.400");
  });
});

// ── Persistence across calls ──────────────────────────────────────────

describe("reconcile + save — persistence", () => {
  it("a cache miss followed by a re-encounter reads the new row on the second call", async () => {
    const path = `${tmp}/persist.json`;
    const reg1: Registry = {};
    // First encounter: cache miss for an unseen model.
    const f = fakeUI();
    const first = await reconcile(
      makeModel({ input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 }),
      reg1,
      {
        ui: f.ui,
        save: (r) => {
          // Simulate the extension: write the in-memory registry to disk.
          saveCache(path, r);
        },
        now: new Date("2026-07-03T14:00:00Z"),
      },
    );
    expect(first.outcome).toBe("added");
    expect(Object.keys(first.registry)).toContain("minimax/MiniMax-M3");

    // Second encounter of the same model: should be a no-change hit,
    // not a cache miss. The on-disk file is what we'd re-load on restart.
    const reg2 = loadCache(path).registry;
    const f2 = fakeUI();
    const second = await reconcile(
      makeModel({ input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 }),
      reg2,
      { ui: f2.ui, save: () => {}, now: new Date("2026-07-03T14:05:00Z") },
    );
    expect(second.outcome).toBe("no-change");
    expect(f2.calls.selects.length).toBe(0);
    expect(f2.calls.notifies.length).toBe(0);
  });
});

// ── isModelPeak ─────────────────────────────────────────────────────────

describe("isModelPeak", () => {
  it("returns false for models without peak_windows (MiniMax)", () => {
    const atPeak = new Date("2026-07-04T02:00:00Z"); // 02:00 UTC
    expect(isModelPeak("minimax", "MiniMax-M3", SEED, atPeak)).toBe(false);
  });

  it("returns true for DeepSeek V4 models during peak hours (01-04 UTC)", () => {
    const atPeak = new Date("2026-07-04T02:00:00Z"); // 02:00 UTC
    expect(isModelPeak("deepseek", "deepseek-v4-flash", SEED, atPeak)).toBe(
      true,
    );
    expect(isModelPeak("deepseek", "deepseek-v4-pro", SEED, atPeak)).toBe(true);
  });

  it("returns true for DeepSeek V4 models during peak hours (06-10 UTC)", () => {
    const atPeak = new Date("2026-07-04T08:00:00Z"); // 08:00 UTC
    expect(isModelPeak("deepseek", "deepseek-v4-flash", SEED, atPeak)).toBe(
      true,
    );
    expect(isModelPeak("deepseek", "deepseek-v4-pro", SEED, atPeak)).toBe(true);
  });

  it("returns false for DeepSeek V4 models during off-peak hours", () => {
    const offPeak = new Date("2026-07-04T12:00:00Z"); // 12:00 UTC
    expect(isModelPeak("deepseek", "deepseek-v4-flash", SEED, offPeak)).toBe(
      false,
    );
    expect(isModelPeak("deepseek", "deepseek-v4-pro", SEED, offPeak)).toBe(
      false,
    );
  });

  it("returns false for unknown models", () => {
    const atPeak = new Date("2026-07-04T02:00:00Z");
    expect(isModelPeak("unknown", "unknown-model", SEED, atPeak)).toBe(false);
  });
});
