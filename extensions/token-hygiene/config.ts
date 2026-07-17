/**
 * Token-hygiene config loading and validation.
 *
 * No phase gating — all features are live by default.
 * Compression (bash output summarization) is not yet implemented
 * and remains disabled via compressBashSuccesses: false.
 *
 * Env precedence (highest to lowest):
 *   1. PI_TOKEN_HYGIENE=0 (master disable)
 *   2. .pi-token-hygiene-off sentinel (only when gitignored)
 *   3. PI_TOKEN_HYGIENE_METRICS=0/1
 *   4. PI_TOKEN_HYGIENE_NO_COMPRESS=1 (per-command, not stored in config)
 *   5. PI_TOKEN_HYGIENE_WORKLOAD=<label>
 *   6. DEFAULT_CONFIG
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md (#Configuration)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  TokenHygieneConfig,
  ConfigDiagnostic,
  LoadConfigResult,
  LoadConfigOptions,
  IdentifierMode,
  WarningVisibility,
} from "./types.ts";

// ── Default config ──────────────────────────────────────────────────

export const DEFAULT_CONFIG: TokenHygieneConfig = {
  configVersion: 1,
  phase: 1,
  enabled: true,
  metricsEnabled: true,
  metricsPath: ".pi/token-hygiene-metrics.jsonl",
  metricsSampleRate: 1.0,
  workloadLabel: "unlabeled",
  identifierMode: "hmac",
  metricsRetentionDays: 30,
  metricsMaxBytesPerFile: 10_000_000,
  metricsMaxFiles: 5,
  warnDuplicateReads: true,
  warnToolChoice: true,
  warnLargeReads: true,
  warnCustomContextVisibility: true,
  warningVisibility: "model-visible",
  compressBashSuccesses: false,
  largeReadLineThreshold: 500,
  largeListingThreshold: 500,
  modelVisibleMessageThresholdChars: 500,
  minCompressLines: 25,
  minCompressChars: 200,
  retainOutputThreshold: 30_000,
};

// ── Sentinel helpers ─────────────────────────────────────────────────

/**
 * Check whether `pattern` appears as a line in `.gitignore` at `cwd`.
 * Trims whitespace and ignores blank/comment lines.
 */
export function isGitIgnored(cwd: string, pattern: string): boolean {
  const gitignorePath = join(cwd, ".gitignore");
  if (!existsSync(gitignorePath)) return false;

  const content = readFileSync(gitignorePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (trimmed === pattern) return true;
  }
  return false;
}

/**
 * Check whether `.pi-token-hygiene-off` sentinel exists at `cwd`
 * AND is listed in `.gitignore`.
 */
export function checkSentinel(cwd: string): boolean {
  const sentinelPath = join(cwd, ".pi-token-hygiene-off");
  return existsSync(sentinelPath) && isGitIgnored(cwd, ".pi-token-hygiene-off");
}

// ── Env var helpers ─────────────────────────────────────────────────

function getEnvVar(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  return env[name];
}

function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "0" || value === "false") return false;
  if (value === "1" || value === "true") return true;
  return undefined; // invalid — let caller decide fallback
}

function parseIntEnv(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseFloatEnv(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Config loader ────────────────────────────────────────────────────

/**
 * Load and validate token-hygiene configuration.
 *
 * Precedence (highest to lowest):
 * 1. PI_TOKEN_HYGIENE=0 → enabled: false
 * 2. .pi-token-hygiene-off sentinel (only when gitignored) → enabled: false
 * 3. Per-field env vars
 * 4. DEFAULT_CONFIG
 *
 * All invalid values fail closed to the safer default.
 */
export function loadTokenHygieneConfig(
  options: LoadConfigOptions = {},
): LoadConfigResult {
  const diagnostics: ConfigDiagnostic[] = [];
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  // 1. Start with DEFAULT_CONFIG
  const config: TokenHygieneConfig = { ...DEFAULT_CONFIG };

  // 2. Apply env vars
  applyEnvConfig(config, env, diagnostics);

  // 3. Check sentinel
  if (checkSentinel(cwd)) {
    config.enabled = false;
    diagnostics.push({
      level: "info",
      message:
        "Token hygiene disabled by .pi-token-hygiene-off sentinel. " +
        "Existing metrics are not deleted; run `pnpm tsx scripts/token-hygiene/analyse-metrics.ts --delete-local-metrics` to remove repo-local token-hygiene data.",
    });
  }

  // 4. Check PI_TOKEN_HYGIENE=0 (highest precedence)
  const masterDisable = getEnvVar(env, "PI_TOKEN_HYGIENE");
  if (masterDisable === "0") {
    config.enabled = false;
    diagnostics.push({
      level: "info",
      message:
        "Token hygiene disabled by PI_TOKEN_HYGIENE=0. " +
        "Existing metrics are not deleted; run `pnpm tsx scripts/token-hygiene/analyse-metrics.ts --delete-local-metrics` to remove repo-local token-hygiene data.",
    });
  }

  // 5. Validate and fail-closed
  validateConfig(config, diagnostics);

  return { config, diagnostics };
}

// ── Env config application ─────────────────────────────────────────

function applyEnvConfig(
  config: TokenHygieneConfig,
  env: Record<string, string | undefined>,
  diagnostics: ConfigDiagnostic[],
): void {
  // PI_TOKEN_HYGIENE_METRICS
  const metricsEnv = parseBoolEnv(getEnvVar(env, "PI_TOKEN_HYGIENE_METRICS"));
  if (metricsEnv !== undefined) {
    config.metricsEnabled = metricsEnv;
  }

  // PI_TOKEN_HYGIENE_IDENTIFIER_MODE
  const idMode = getEnvVar(env, "PI_TOKEN_HYGIENE_IDENTIFIER_MODE");
  if (idMode !== undefined) {
    if (idMode === "hmac" || idMode === "clear-local-debug") {
      config.identifierMode = idMode;
    } else {
      diagnostics.push({
        level: "warn",
        message: `Invalid identifierMode "${idMode}", falling back to "hmac".`,
      });
      // Fail closed: identifierMode stays "hmac" (the default)
    }
  }

  // PI_TOKEN_HYGIENE_COMPRESS_BASH
  const compressBash = parseBoolEnv(
    getEnvVar(env, "PI_TOKEN_HYGIENE_COMPRESS_BASH"),
  );
  if (compressBash !== undefined) {
    if (compressBash === true) {
      diagnostics.push({
        level: "warn",
        message:
          "compressBashSuccesses enabled by env — bash output compression is not yet implemented.",
      });
    }
    config.compressBashSuccesses = compressBash;
  }

  // PI_TOKEN_HYGIENE_WORKLOAD
  const workload = getEnvVar(env, "PI_TOKEN_HYGIENE_WORKLOAD");
  if (workload !== undefined && workload.length > 0) {
    config.workloadLabel = workload;
  }

  // PI_TOKEN_HYGIENE_METRICS_RETENTION_DAYS
  const retentionDays = parseIntEnv(
    getEnvVar(env, "PI_TOKEN_HYGIENE_METRICS_RETENTION_DAYS"),
  );
  if (retentionDays !== undefined) {
    config.metricsRetentionDays = clamp(retentionDays, 0, 3650);
  }

  // PI_TOKEN_HYGIENE_MAX_BYTES_PER_FILE
  const maxBytes = parseIntEnv(
    getEnvVar(env, "PI_TOKEN_HYGIENE_MAX_BYTES_PER_FILE"),
  );
  if (maxBytes !== undefined) {
    config.metricsMaxBytesPerFile = clamp(maxBytes, 1, 1_000_000_000);
  }

  // PI_TOKEN_HYGIENE_MAX_FILES
  const maxFiles = parseIntEnv(getEnvVar(env, "PI_TOKEN_HYGIENE_MAX_FILES"));
  if (maxFiles !== undefined) {
    config.metricsMaxFiles = clamp(maxFiles, 1, 1000);
  }

  // PI_TOKEN_HYGIENE_SAMPLE_RATE
  const sampleRate = parseFloatEnv(
    getEnvVar(env, "PI_TOKEN_HYGIENE_SAMPLE_RATE"),
  );
  if (sampleRate !== undefined) {
    config.metricsSampleRate = clamp(sampleRate, 0, 1);
  }

  // PI_TOKEN_HYGIENE_LARGE_READ_THRESHOLD
  const largeReadThreshold = parseIntEnv(
    getEnvVar(env, "PI_TOKEN_HYGIENE_LARGE_READ_THRESHOLD"),
  );
  if (largeReadThreshold !== undefined) {
    config.largeReadLineThreshold = clamp(largeReadThreshold, 1, 1_000_000);
  }

  // PI_TOKEN_HYGIENE_WARNING_VISIBILITY
  const warnVis = getEnvVar(env, "PI_TOKEN_HYGIENE_WARNING_VISIBILITY");
  if (warnVis !== undefined) {
    if (
      warnVis === "model-visible" ||
      warnVis === "ui-only" ||
      warnVis === "both"
    ) {
      config.warningVisibility = warnVis;
    } else {
      diagnostics.push({
        level: "warn",
        message: `Invalid warningVisibility "${warnVis}", falling back to "model-visible".`,
      });
      // Fail closed: warningVisibility stays "model-visible"
    }
  }

  // PI_TOKEN_HYGIENE_RETAIN_THRESHOLD
  const retainThreshold = parseIntEnv(
    getEnvVar(env, "PI_TOKEN_HYGIENE_RETAIN_THRESHOLD"),
  );
  if (retainThreshold !== undefined) {
    config.retainOutputThreshold = clamp(retainThreshold, 1_000, 1_000_000);
  }
}

// ── Validation ───────────────────────────────────────────────────────

function validateConfig(
  config: TokenHygieneConfig,
  diagnostics: ConfigDiagnostic[],
): void {
  // Validate identifierMode
  const validIdentifierModes: IdentifierMode[] = ["hmac", "clear-local-debug"];
  if (!validIdentifierModes.includes(config.identifierMode as IdentifierMode)) {
    diagnostics.push({
      level: "warn",
      message: `Invalid identifierMode "${config.identifierMode}", falling back to "hmac".`,
    });
    config.identifierMode = "hmac";
  }

  // Validate warningVisibility
  const validVisibilities: WarningVisibility[] = [
    "model-visible",
    "ui-only",
    "both",
  ];
  if (
    !validVisibilities.includes(config.warningVisibility as WarningVisibility)
  ) {
    diagnostics.push({
      level: "warn",
      message: `Invalid warningVisibility "${config.warningVisibility}", falling back to "model-visible".`,
    });
    config.warningVisibility = "model-visible";
  }

  // Validate numeric ranges
  config.metricsRetentionDays = clamp(config.metricsRetentionDays, 0, 3650);
  config.metricsMaxBytesPerFile = clamp(
    config.metricsMaxBytesPerFile,
    1,
    1_000_000_000,
  );
  config.metricsMaxFiles = clamp(config.metricsMaxFiles, 1, 1000);
  config.metricsSampleRate = clamp(config.metricsSampleRate, 0, 1);
  config.largeReadLineThreshold = clamp(
    config.largeReadLineThreshold,
    1,
    1_000_000,
  );
  config.largeListingThreshold = clamp(
    config.largeListingThreshold,
    1,
    1_000_000,
  );
  config.modelVisibleMessageThresholdChars = clamp(
    config.modelVisibleMessageThresholdChars,
    1,
    1_000_000,
  );
  config.minCompressLines = clamp(config.minCompressLines, 1, 1_000_000);
  config.minCompressChars = clamp(config.minCompressChars, 1, 1_000_000);
}

// ── Backward-compatible aliases for index.ts ─────────────────────────
export const loadConfig = loadTokenHygieneConfig;
export const sentinelExists = checkSentinel;
export function getDisableDiagnostics(config: TokenHygieneConfig): string {
  if (config.enabled) return "Token hygiene is active.";
  return "Token hygiene disabled. Run `pnpm tsx scripts/token-hygiene/analyse-metrics.ts --delete-local-metrics` to remove local data.";
}
