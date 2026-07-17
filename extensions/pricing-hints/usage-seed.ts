/**
 * Usage-limits seed data.
 *
 * Known limits sourced from provider documentation. The user can
 * override these by editing `~/.pi/agent/usage-cache.json` directly
 * or by configuring `fetch_config` for auto-refresh from provider APIs.
 *
 * Sources:
 *   - OpenAI platform limits:  https://platform.openai.com/docs/guides/rate-limits
 *   - OpenCode Go usage limits: https://opencode.ai/docs/go/#usage-limits
 *   - DeepSeek API docs:        https://platform.deepseek.com/api-docs
 *   - MiniMax API docs:         https://minimax-ai.chat/pricing/
 */

import type { UsageRegistry } from "./usage-types.ts";

export const USAGE_SEED: UsageRegistry = {
  openai: {
    label: "OpenAI",
    usage: { input_tokens: 0, output_tokens: 0, requests: 0 },
    limits: {
      rpm: 10_000,
      tpm: 2_000_000,
      monthly_budget_usd: 100,
      tier_label: "Tier 5",
      max_context: 128_000,
    },
    period_start: new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
    dashboard_url: "https://platform.openai.com/usage",
    fetch_config: {
      url: "https://api.openai.com/v1/dashboard/billing/usage?start_date=2026-07-01&end_date=2026-07-31",
      headers: {
        Authorization: "Bearer $OPENAI_API_KEY",
      },
      mapping: {
        remaining_usd: "total_usage",
        budget_usd: "hard_limit_usd",
      },
    },
  },
  "opencode-go": {
    label: "OpenCode Go",
    usage: { input_tokens: 0, output_tokens: 0, requests: 0 },
    limits: {
      rpm: 60,
      rpd: 2_000,
      tpd: 10_000_000,
      monthly_budget_usd: 20,
      tier_label: "Go Pro",
      max_context: 32_000,
    },
    period_start: new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
    dashboard_url: "https://opencode.ai/dashboard/usage",
  },
  deepseek: {
    label: "DeepSeek",
    usage: { input_tokens: 0, output_tokens: 0, requests: 0 },
    limits: {
      rpm: 500,
      tpm: 1_000_000,
      tier_label: "Standard",
      max_context: 128_000,
    },
    period_start: new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
    dashboard_url: "https://platform.deepseek.com/usage",
  },
  minimax: {
    label: "MiniMax",
    usage: { input_tokens: 0, output_tokens: 0, requests: 0 },
    limits: {
      rpm: 500,
      tpm: 1_000_000,
      tier_label: "Standard",
      max_context: 128_000,
    },
    period_start: new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
    dashboard_url: "https://minimax-ai.chat/pricing/",
  },
  "opencode-codex": {
    label: "OpenCode Codex",
    usage: { input_tokens: 0, output_tokens: 0, requests: 0 },
    limits: {
      rpm: 500,
      monthly_budget_usd: 50,
      tier_label: "Codex",
      max_context: 128_000,
    },
    period_start: new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
    dashboard_url: "https://opencode.ai/dashboard/usage",
  },
};
