/**
 * Usage-limits types for the pricing-hints extension.
 *
 * Tracks per-provider usage vs limits, with optional API fetch config
 * for providers that expose usage endpoints (e.g. OpenAI billing API).
 *
 * Spec: docs/superpowers/specs/2026-07-03-pricing-hints-design.md
 */

/**
 * Accumulated usage figures for a provider.
 */
export type UsageData = {
  /** Tokens used as input (includes cached reads) */
  input_tokens: number;
  /** Tokens used as output */
  output_tokens: number;
  /** Number of API requests made */
  requests: number;
};

/**
 * Known limits for a provider/subscription.
 */
export type Limits = {
  /** Rate limit: requests per minute */
  rpm?: number;
  /** Rate limit: requests per day */
  rpd?: number;
  /** Rate limit: tokens per minute */
  tpm?: number;
  /** Rate limit: tokens per day */
  tpd?: number;
  /** Monthly spending cap in USD */
  monthly_budget_usd?: number;
  /** Max context window tokens for this provider */
  max_context?: number;
  /** Human label for the tier/plan (e.g. "Go Pro", "Tier 5") */
  tier_label?: string;
};

/**
 * Configuration for fetching usage data from a provider API.
 */
export type UsageFetchConfig = {
  /** The URL to fetch (supports $ENV_VAR references) */
  url: string;
  /** HTTP method (default GET) */
  method?: "GET" | "POST";
  /** Request headers (supports $ENV_VAR references for secrets) */
  headers?: Record<string, string>;
  /** JSON path (dot-notation) to the usage data in the response body */
  result_path?: string;
  /** How to extract each metric from the response */
  mapping: {
    /** Path to total input tokens used */
    input_tokens?: string;
    /** Path to total output tokens used */
    output_tokens?: string;
    /** Path to total requests */
    requests?: string;
    /** Path to remaining budget/credits */
    remaining_usd?: string;
    /** Path to total/allowed budget */
    budget_usd?: string;
    /** Path to remaining requests in current window */
    remaining_requests?: string;
    /** Path to rate limit */
    limit_rpm?: string;
  };
  /** ISO datetime of last successful fetch */
  last_fetched?: string;
};

/**
 * One provider entry in the usage registry.
 */
export type ProviderUsage = {
  /** Human-readable label */
  label: string;
  /** Current period usage data */
  usage: UsageData;
  /** Known limits for this provider */
  limits: Limits;
  /** When the current accounting period started */
  period_start: string;
  /** Optional API fetch config for auto-refresh */
  fetch_config?: UsageFetchConfig;
  /** Dashboard URL for manual checking */
  dashboard_url?: string;
};

export type UsageRegistry = Record<string, ProviderUsage>;

/**
 * Level of usage pressure for a provider.
 */
export type UsagePressure =
  | { level: "ok"; label: string }
  | { level: "warn"; label: string }
  | { level: "critical"; label: string };

export const USAGE_CACHE_PATH = ".pi/agent/usage-cache.json";
