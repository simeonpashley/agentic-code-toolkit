/**
 * Token-hygiene shared types.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md
 */

export type ConfigVersion = 1;

export type Phase = 0 | 1 | 2;

export type IdentifierMode = "hmac" | "clear-local-debug";

export type WarningVisibility = "model-visible" | "ui-only" | "both";

/**
 * Complete token-hygiene configuration.
 *
 * All numeric ranges, enum values, and booleans are validated at load time.
 * Invalid values fail closed to the safer default.
 */
export type TokenHygieneConfig = {
  configVersion: ConfigVersion;
  phase: Phase;

  /** Master toggle. When false, no metrics, warnings, commands, or compression. */
  enabled: boolean;

  /** Phase 0 default: false. Enables local JSONL metric logging. */
  metricsEnabled: boolean;
  /** Path for the main metrics JSONL file, relative to repo root. */
  metricsPath: string;
  /** Fraction of sessions that record metrics (0.0–1.0). */
  metricsSampleRate: number;
  /** Comparable workload label for cross-session analysis. */
  workloadLabel: string;

  /** How identifiers are stored in metrics. */
  identifierMode: IdentifierMode;

  /** Maximum days to retain metrics files. 0 = delete immediately. */
  metricsRetentionDays: number;
  /** Size threshold before rotating metrics file. */
  metricsMaxBytesPerFile: number;
  /** Maximum rotated metrics files to keep. */
  metricsMaxFiles: number;

  // ── Phase 1 warn-only toggles ──────────────────────────────────
  warnDuplicateReads: boolean;
  warnToolChoice: boolean;
  warnLargeReads: boolean;
  warnCustomContextVisibility: boolean;
  warningVisibility: WarningVisibility;

  // ── Phase 2 compression (always false in Phase 0/1) ────────────
  compressBashSuccesses: boolean;

  // ── Thresholds ─────────────────────────────────────────────────
  largeReadLineThreshold: number;
  largeListingThreshold: number;
  modelVisibleMessageThresholdChars: number;
  minCompressLines: number;
  minCompressChars: number;

  // ── Retention ───────────────────────────────────────────────────
  /** Threshold in bytes for retaining large tool outputs. Default 30_000. */
  retainOutputThreshold: number;
  /** Per-tool threshold overrides. Key is tool name (e.g., "read"). Falls back to retainOutputThreshold. */
  retainOutputPerToolThresholds?: Record<string, number>;
};

/** Duplicate classification for read/search observations */
export type DuplicateClassification =
  "exact-repeat" | "repeated-search" | "none";

/** Bash command classification for nudges */
export type BashNudgeClassification =
  | "cat-file"
  | "head-file"
  | "tail-file"
  | "sed-range-print"
  | "find-unbounded"
  | "ls-R-large"
  | "no-nudge";

/** Read observation for duplicate tracking */
export interface ReadObservation {
  pathId: string;
  offset?: number;
  limit?: number;
  raw?: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
  contentFingerprint?: string;
  truncated?: boolean;
  suggestedNextOffset?: number;
  turn: number;
}

/** Search observation for duplicate tracking */
export interface SearchObservation {
  tool: "grep" | "glob" | "websearch" | "webfetch";
  key: string;
  pathScopeId?: string;
  resultCount?: number;
  capped?: boolean;
  turn: number;
}

/** Result from the read/search tracker */
export interface DuplicateResult {
  classification: DuplicateClassification;
  previousTurn?: number;
}

/** Warning event from the token-hygiene extension */
export interface HygieneWarning {
  kind:
    | "duplicate-read"
    | "duplicate-search"
    | "bash-nudge"
    | "large-read"
    | "custom-context";
  visibility: WarningVisibility;
  toolName?: string;
  callId?: string;
  message: string;
}

/** Input for the context report builder */
export interface TokenHygieneReportInput {
  warnings: HygieneWarning[];
  metricsAvailable: boolean;
  metricsPath?: string;
  retentionDays: number;
}

/** Context report output */
export interface TokenHygieneReport {
  totalEstimatedTokens: number;
  contextPercent: number;
  buckets: ContextBucketSummary[];
  recentWarnings: HygieneWarning[];
  biggestAvoidableDebris: string;
  candidateReductions: string[];
  metricsStatus: string;
  dataControls: {
    metricsPath?: string;
    deleteCommand: string;
    retentionDays: number;
    backupCaveat: string;
  };
}

/** Context bucket summary */
export interface ContextBucketSummary {
  name: string;
  estimatedTokens: number;
  candidateReduction?: string;
}

/** Diagnostic message emitted during config loading. */
export type ConfigDiagnostic = {
  level: "info" | "warn" | "error";
  message: string;
};

/** Return type for loadTokenHygieneConfig. */
export type LoadConfigResult = {
  config: TokenHygieneConfig;
  diagnostics: ConfigDiagnostic[];
};

/** Options for loadTokenHygieneConfig. */
export type LoadConfigOptions = {
  /** Environment variables. Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Working directory for sentinel/.gitignore detection. Defaults to process.cwd(). */
  cwd?: string;
};

/** Compression eligibility result. */
export type CompressionEligibility =
  | "disabled-by-config"
  | "non-zero-exit"
  | "unknown-family"
  | "never-compress"
  | "below-threshold"
  | "sensitive-output"
  | "retention-failed"
  | "eligible";

/** Sensitive content classification for compression gating. */
export type SensitiveClassification = "sensitive" | "not-sensitive" | "unknown";

export type CompressionDecision = {
  family: string | null;
  applied: boolean;
  originalChars: number;
  originalLines: number;
  compressedChars: number;
  compressedLines: number;
  neverCompressReason: string | null;
  retainedOutputId: string | null;
};

export type BashCompressorResult =
  | { kind: "pass-through"; decision: CompressionDecision }
  | {
      kind: "summary";
      summary: string;
      retainedOutputId: string;
      decision: CompressionDecision;
    };
