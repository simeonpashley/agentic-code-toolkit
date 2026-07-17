/**
 * Pricing-hints registry seed.
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 *
 * The data we've collected from the providers' pricing pages. Written
 * to `~/.pi/agent/pricing-cache.json` on first run when the file
 * doesn't exist; thereafter the user's file is authoritative.
 *
 * Sources (per model):
 *   - MiniMax official pricing:        https://minimax-ai.chat/pricing/
 *   - OpenCode Go usage-limits page:    https://opencode.ai/docs/go/#usage-limits
 *   - DeepSeek V4 release email:        2026-07-03 (peak UTC 01-04 and 06-10)
 *   - OpenAI API pricing:               https://platform.openai.com/docs/pricing
 */
import type { Registry } from "./types.ts";

export const SEED: Registry = {
  "minimax/MiniMax-M3": {
    cost: { input_cache_hit: 0.06, input_cache_miss: 0.3, output: 1.2 },
    source_url: "https://minimax-ai.chat/pricing/",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "minimax/m2.7": {
    cost: { input_cache_hit: 0.06, input_cache_miss: 0.3, output: 1.2 },
    source_url: "https://minimax-ai.chat/pricing/",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "minimax/m2.5": {
    cost: { input_cache_hit: 0.03, input_cache_miss: 0.3, output: 1.2 },
    source_url: "https://minimax-ai.chat/pricing/",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "deepseek/deepseek-v4-pro": {
    cost: { input_cache_hit: 0.003625, input_cache_miss: 0.435, output: 0.87 },
    source_url: "https://platform.deepseek.com/api-docs/pricing",
    date_modified: "2026-07-03T00:00:00.000Z",
    peak_windows: [
      {
        from_h: 1,
        until_h: 4,
        input_cache_hit: 0.00725,
        input_cache_miss: 0.87,
        output: 1.74,
      },
      {
        from_h: 6,
        until_h: 10,
        input_cache_hit: 0.00725,
        input_cache_miss: 0.87,
        output: 1.74,
      },
      {
        from_h: 0,
        until_h: 24,
        input_cache_hit: 0.003625,
        input_cache_miss: 0.435,
        output: 0.87,
      },
    ],
  },
  "deepseek/deepseek-v4-flash": {
    cost: { input_cache_hit: 0.0028, input_cache_miss: 0.14, output: 0.28 },
    source_url: "https://platform.deepseek.com/api-docs/pricing",
    date_modified: "2026-07-03T00:00:00.000Z",
    peak_windows: [
      {
        from_h: 1,
        until_h: 4,
        input_cache_hit: 0.0056,
        input_cache_miss: 0.28,
        output: 0.56,
      },
      {
        from_h: 6,
        until_h: 10,
        input_cache_hit: 0.0056,
        input_cache_miss: 0.28,
        output: 0.56,
      },
      {
        from_h: 0,
        until_h: 24,
        input_cache_hit: 0.0028,
        input_cache_miss: 0.14,
        output: 0.28,
      },
    ],
  },
  "opencode-go/deepseek-v4-pro": {
    cost: { input_cache_hit: 0.0145, input_cache_miss: 1.74, output: 3.48 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
    peak_windows: [
      {
        from_h: 1,
        until_h: 4,
        input_cache_hit: 0.029,
        input_cache_miss: 3.48,
        output: 6.96,
      },
      {
        from_h: 6,
        until_h: 10,
        input_cache_hit: 0.029,
        input_cache_miss: 3.48,
        output: 6.96,
      },
      {
        from_h: 0,
        until_h: 24,
        input_cache_hit: 0.0145,
        input_cache_miss: 1.74,
        output: 3.48,
      },
    ],
  },
  "opencode-go/deepseek-v4-flash": {
    cost: { input_cache_hit: 0.0028, input_cache_miss: 0.14, output: 0.28 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
    peak_windows: [
      {
        from_h: 1,
        until_h: 4,
        input_cache_hit: 0.0056,
        input_cache_miss: 0.28,
        output: 0.56,
      },
      {
        from_h: 6,
        until_h: 10,
        input_cache_hit: 0.0056,
        input_cache_miss: 0.28,
        output: 0.56,
      },
      {
        from_h: 0,
        until_h: 24,
        input_cache_hit: 0.0028,
        input_cache_miss: 0.14,
        output: 0.28,
      },
    ],
  },
  "opencode-go/qwen3.7-max": {
    cost: { input_cache_hit: 0.5, input_cache_miss: 2.5, output: 7.5 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "opencode-go/qwen3.6-plus": {
    cost: { input_cache_hit: 0.05, input_cache_miss: 0.5, output: 3.0 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "opencode-go/glm-5.2": {
    cost: { input_cache_hit: 0.26, input_cache_miss: 1.4, output: 4.4 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "opencode-go/kimi-k2.7-code": {
    cost: { input_cache_hit: 0.19, input_cache_miss: 0.95, output: 4.0 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "opencode-go/kimi-k2.6": {
    cost: { input_cache_hit: 0.16, input_cache_miss: 0.95, output: 4.0 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "opencode-go/mimo-v2.5": {
    cost: { input_cache_hit: 0.0028, input_cache_miss: 0.14, output: 0.28 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "opencode-go/mimo-v2.5-pro": {
    cost: { input_cache_hit: 0.0145, input_cache_miss: 1.74, output: 3.48 },
    source_url: "https://opencode.ai/docs/go/#usage-limits",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "opencode/gpt-5.5": {
    cost: { input_cache_hit: 0.5, input_cache_miss: 5.0, output: 30.0 },
    source_url: "https://platform.openai.com/docs/pricing",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
  "opencode-codex/gpt-5.3-codex": {
    cost: { input_cache_hit: 0.175, input_cache_miss: 1.75, output: 14.0 },
    source_url: "https://platform.openai.com/docs/pricing",
    date_modified: "2026-07-03T00:00:00.000Z",
  },
};
