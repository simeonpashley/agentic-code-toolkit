import { visibleWidth } from "@earendil-works/pi-tui";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const THINKING_ROLES: Record<ThinkingLevel, string> = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
};

const PROVIDER_SHORTNAMES: Record<string, string> = {
  "openai-codex": "CODEX",
  "opencode-go": "OGO",
  deepseek: "DS",
};

export type ThemeFg = {
  fg: (role: any, text: string) => string;
  bold: (text: string) => string;
  inverse: (text: string) => string;
};

// ── Tokens ─────────────────────────────────────────────────────────────

export function fmtTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// ── Path ───────────────────────────────────────────────────────────────

export function renderPath(
  pathRaw: string,
  budget: number,
  theme: ThemeFg,
): string {
  if (budget < 10) return "";
  if (visibleWidth(pathRaw) <= budget) return theme.fg("warning", pathRaw);
  return theme.fg("warning", "…" + pathRaw.slice(-(budget - 1)));
}

export function buildPathString(cwd: string, branch: string | null): string {
  let pwd = cwd;
  const home = process.env["HOME"] || process.env["USERPROFILE"];
  if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
  return pwd + (branch ? ` (${branch})` : "");
}

// ── Context Usage ──────────────────────────────────────────────────────

export function renderContextUsage(
  pct: number,
  win: number,
  theme: { fg: (role: any, text: string) => string },
): string {
  const raw = `${pct.toFixed(0)}%/${fmtTokens(win)}`;
  if (pct > 90) return theme.fg("error", `🌑 ${raw}`);
  if (pct > 80) return theme.fg("warning", `🌘 ${raw}`);
  if (pct > 60) return theme.fg("warning", `🌗 ${raw}`);
  if (pct > 40) return theme.fg("warning", `🌖 ${raw}`);
  return theme.fg("success", `🌕 ${raw}`);
}

// ── Cache Usage ────────────────────────────────────────────────────────

/**
 * Render cache usage: hit rate = cacheRead / (cacheRead + input).
 * Display shows: 🎯 55% (percentage only; token ratios are omitted to keep the footer compact).
 *
 * Color coding:
 *   ≥ 60% → success (green)  — most input served from cache
 *   30-59% → warning (yellow) — moderate cache efficiency
 *   < 30% → error (red)       — low cache efficiency
 */
export function renderCacheUsage(
  input: number,
  cacheRead: number,
  theme: { fg: (role: any, text: string) => string },
): string {
  if (input === 0 && cacheRead === 0) return "";
  const total = cacheRead + input;
  const pct = Math.round((cacheRead / total) * 100);
  const role = pct >= 60 ? "success" : pct >= 30 ? "warning" : "error";
  return theme.fg(role, `🎯 ${pct}%`);
}

// ── Model + Thinking ───────────────────────────────────────────────────

export function renderModelInfo(
  modelName: string,
  provider: string,
  thinking: string,
  theme: ThemeFg,
): { text: string; rawWidth: number } {
  const thinkSuffix = thinking !== "off" ? `(${thinking})` : "";
  const providerLabel = PROVIDER_SHORTNAMES[provider] ?? provider;
  const mdlText = `${providerLabel}/${modelName}`;
  const rawWidth = visibleWidth(`${mdlText}${thinkSuffix}`);

  let text = theme.fg("accent", `${mdlText}`);
  if (thinking !== "off") {
    const role =
      THINKING_ROLES[thinking as ThinkingLevel] ?? THINKING_ROLES.off;
    text += theme.fg(role, thinkSuffix);
  }

  return { text, rawWidth };
}
