/**
 * Usage-limits engine — pure-ish.
 *
 * Pure functions for computing usage pressure and formatting reports.
 * I/O (fetch, cache load/save) is done by the caller.
 */
import type {
  UsageRegistry,
  ProviderUsage,
  UsageData,
  Limits,
  UsagePressure,
} from "./usage-types.ts";
import { USAGE_SEED } from "./usage-seed.ts";

// ── Pressure computation ─────────────────────────────────────────

/**
 * Compute the usage pressure level for a provider.
 *
 * Pressure thresholds:
 *   - >= 90% → critical (red)
 *   - >= 75% → warn    (yellow)
 *   - < 75%  → ok      (green)
 */
export function computePressure(
  usage: UsageData,
  limits: Limits,
): UsagePressure {
  const ratios: number[] = [];

  if (limits.monthly_budget_usd) {
    // Estimate cost — crude proxy using standard pricing. The user's
    // actual cost depends on the models they use, but this gives a
    // directional signal.
    // We approximate $/1M tokens using a mid-range blended cost.
    const blendedPerM = 1.5; // ~$1.50/1M blended average
    const totalTokens = (usage.input_tokens + usage.output_tokens) / 1_000_000;
    const estCost = totalTokens * blendedPerM;
    const budgetRatio = estCost / limits.monthly_budget_usd;
    if (budgetRatio > 0) ratios.push(budgetRatio);
  }

  if (limits.rpd && usage.requests > 0) {
    ratios.push(usage.requests / limits.rpd);
  }

  if (limits.tpd && usage.input_tokens + usage.output_tokens > 0) {
    ratios.push((usage.input_tokens + usage.output_tokens) / limits.tpd);
  }

  const maxRatio = ratios.length > 0 ? Math.max(...ratios) : 0;
  const pct = Math.round(maxRatio * 100);

  if (maxRatio >= 0.9) {
    return { level: "critical", label: `${pct}% used` };
  }
  if (maxRatio >= 0.75) {
    return { level: "warn", label: `${pct}% used` };
  }
  return { level: "ok", label: pct > 0 ? `${pct}% used` : "no data" };
}

// ── Renderers ────────────────────────────────────────────────────
/**
 * Compact status bar element for usage.
 * Returns null when pressure is ok — keeps the status bar clean.
 */
export function renderUsageStatusBar(entry: ProviderUsage): string | null {
  const pressure = computePressure(entry.usage, entry.limits);
  if (pressure.level === "ok") return null;

  const icon =
    pressure.level === "critical"
      ? "\x1b[31m🔴\x1b[0m"
      : "\x1b[38;5;208m🟡\x1b[0m";
  return `${icon} ${entry.label}: ${pressure.label}`;
}

/**
 * Format a full usage report for the /usage command.
 * Returns markdown-formatted text for display in a confirm dialog.
 */
export function formatUsageReport(registry: UsageRegistry): string {
  const entries = Object.entries(registry);
  if (entries.length === 0) return "usage: no provider data";

  const lines: string[] = [];
  lines.push("Usage & Limits Report");
  lines.push("═".repeat(60));
  lines.push("");

  for (const [key, entry] of entries) {
    const pressure = computePressure(entry.usage, entry.limits);
    const icon =
      pressure.level === "critical"
        ? "🔴"
        : pressure.level === "warn"
          ? "🟡"
          : "🟢";

    lines.push(` ${icon} ${entry.label} (${key})`);
    lines.push("─".repeat(50));

    // Limits
    const lim = entry.limits;
    const limitParts: string[] = [];
    if (lim.tier_label) limitParts.push(`Tier: ${lim.tier_label}`);
    if (lim.monthly_budget_usd)
      limitParts.push(`Budget: $${lim.monthly_budget_usd}`);
    if (lim.rpm) limitParts.push(`RPM: ${fmtNum(lim.rpm)}`);
    if (lim.rpd) limitParts.push(`RPD: ${fmtNum(lim.rpd)}`);
    if (lim.tpm) limitParts.push(`TPM: ${fmtNum(lim.tpm)}`);
    if (lim.tpd) limitParts.push(`TPD: ${fmtNum(lim.tpd)}`);
    if (lim.max_context) limitParts.push(`Context: ${fmtNum(lim.max_context)}`);
    lines.push(`  Limits:   ${limitParts.join(" · ")}`);

    // Usage
    const u = entry.usage;
    const usageParts: string[] = [];
    if (u.input_tokens > 0)
      usageParts.push(`Input: ${fmtNum(u.input_tokens)} tokens`);
    if (u.output_tokens > 0)
      usageParts.push(`Output: ${fmtNum(u.output_tokens)} tokens`);
    if (u.requests > 0) usageParts.push(`Requests: ${fmtNum(u.requests)}`);
    if (usageParts.length === 0) usageParts.push("(no usage recorded)");
    lines.push(`  Usage:    ${usageParts.join(" · ")}`);
    lines.push(`  Pressure: ${pressure.label}`);

    // Period
    const started = entry.period_start.slice(0, 10);
    lines.push(`  Period:   since ${started}`);

    // Dashboard link
    if (entry.dashboard_url) {
      lines.push(`  Dashboard: ${entry.dashboard_url}`);
    }

    // API fetch config (endpoint + required env vars)
    const fetchConfig = entry.fetch_config;
    if (fetchConfig) {
      const envVars = extractEnvVarNames(fetchConfig.url).concat(
        ...Object.entries(fetchConfig.headers ?? {}).flatMap(([, v]) =>
          extractEnvVarNames(v),
        ),
      );
      const uniqueVars = [...new Set(envVars)];
      const setVars = uniqueVars.filter((v) => process.env[v]);
      const missingVars = uniqueVars.filter((v) => !process.env[v]);

      lines.push(`  API:      ${fetchConfig.url}`);
      if (missingVars.length > 0) {
        lines.push(`  Keys:     ❌ missing: ${missingVars.join(", ")}`);
      }
      if (setVars.length > 0) {
        lines.push(`  Keys:     ✅ ${setVars.join(", ")} set`);
      }
      if (fetchConfig.last_fetched) {
        lines.push(
          `  Fetched:  ${fetchConfig.last_fetched.slice(0, 16).replace("T", " ")}`,
        );
      }
    } else {
      lines.push(
        `  API:      (none configured — edit ~/.pi/agent/usage-cache.json to add fetch config)`,
      );
    }

    lines.push("");
  }

  // Summary footer
  const totalWithFetch = entries.filter(([, e]) => e.fetch_config).length;
  const totalConfigured = entries.filter(
    ([, e]) =>
      e.fetch_config &&
      Object.entries(e.fetch_config.headers ?? {}).some(([, v]) =>
        extractEnvVarNames(v).some((n) => !process.env[n]),
      ),
  ).length;
  lines.push("─".repeat(50));
  lines.push(`${entries.length} providers · ${totalWithFetch} with API fetch`);
  if (totalConfigured > 0) {
    lines.push("Set missing env vars and run:  /usage --fetch");
  } else if (totalWithFetch > 0) {
    lines.push("All API keys set. Run:          /usage --fetch");
  } else {
    lines.push("No API fetch configured. Edit ~/.pi/agent/usage-cache.json");
  }

  return lines.join("\n");
}

/**
 * Extract $ENV_VAR references from a string.
 */
function extractEnvVarNames(s: string): string[] {
  const matches = s.match(/\$([A-Z_][A-Z0-9_]*)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1));
}

/**
 * Format a count compactly (e.g., 1200000 → "1.2M").
 */
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Fetch from provider API ──────────────────────────────────────

export type FetchResult = {
  usage: Partial<UsageData>;
  limits: Partial<Limits>;
  raw?: Record<string, unknown>;
};

/**
 * Fetch usage data from a provider API.
 * Returns a partial update that can be merged into the provider's entry.
 * Returns null on failure.
 */
export async function fetchProviderUsage(
  config: NonNullable<ProviderUsage["fetch_config"]>,
  signal?: AbortSignal,
): Promise<FetchResult | null> {
  const url = resolveEnvVars(config.url);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(config.headers ?? {})) {
    headers[k] = resolveEnvVars(v);
  }

  try {
    const response = await fetch(url, {
      method: config.method ?? "GET",
      headers: { ...headers, "Content-Type": "application/json" },
      signal: signal ?? null,
    });

    if (!response.ok) {
      console.error(
        `[usage] fetch failed for ${url}: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const root = config.result_path
      ? ((getByPath(data, config.result_path) as Record<string, unknown>) ??
        data)
      : data;

    const m = config.mapping;
    const usage: Partial<UsageData> = {};
    const limits: Partial<Limits> = {};

    if (m.input_tokens)
      usage.input_tokens = Number(getByPath(root, m.input_tokens)) || 0;
    if (m.output_tokens)
      usage.output_tokens = Number(getByPath(root, m.output_tokens)) || 0;
    if (m.requests) usage.requests = Number(getByPath(root, m.requests)) || 0;
    if (m.remaining_usd) {
      // If we only get remaining, we can't derive usage from it directly.
      // The user will see it in the report.
    }
    if (m.budget_usd)
      limits.monthly_budget_usd = Number(getByPath(root, m.budget_usd)) || 0;
    if (m.remaining_requests) {
      const remaining = Number(getByPath(root, m.remaining_requests)) || 0;
      if (limits.rpd) usage.requests = limits.rpd - remaining;
    }
    if (m.limit_rpm) limits.rpm = Number(getByPath(root, m.limit_rpm)) || 0;

    return { usage, limits, raw: data as Record<string, unknown> };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return null;
    console.error(`[usage] fetch error for ${url}:`, err);
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Resolve $ENV_VAR references in a string.
 * Leaves unresolvable references as-is.
 */
function resolveEnvVars(s: string): string {
  return s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_match, name) => {
    return process.env[name] ?? _match;
  });
}

/**
 * Get a value from a nested object using dot-notation path.
 * e.g., getByPath({a: {b: 1}}, "a.b") → 1
 */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    )
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── Merge helpers for seed + cache ───────────────────────────────

/**
 * Merge a user's cached usage registry with seed data.
 * Seed entries provide defaults for any provider not yet in the cache.
 * Existing cache entries keep their values (user edits are authoritative).
 */
export function mergeWithSeed(cached: UsageRegistry): UsageRegistry {
  const merged: UsageRegistry = { ...USAGE_SEED };
  for (const [key, entry] of Object.entries(cached)) {
    merged[key] = {
      ...merged[key],
      ...entry,
      usage: { ...(merged[key]?.usage ?? {}), ...entry.usage },
      limits: { ...(merged[key]?.limits ?? {}), ...entry.limits },
    };
  }
  return merged;
}
