/**
 * Shared context bucket analyser for the token-hygiene extension.
 *
 * Provides:
 *  - ContextBucketKind  – the 12 known context-bucket categories
 *  - ContextVisibility  – whether a bucket is visible, excluded, or a delta
 *  - estimateTokens()   – fast character-based token estimation
 *  - formatBucketName() – human-readable label for each bucket kind
 *  - analyseContextBuckets() – group segments into per-bucket stats
 *
 * Also re-exports CATEGORY_META + shared types/helpers for use by
 * context-inspector.ts and context-report.ts so the category classification
 * lives in one place.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const IMAGE_TOKEN_ESTIMATE = 1200;
export const DETAIL_TEXT_LIMIT = 999_000;
export const PREVIEW_TEXT_LIMIT = 700;
export const COMPACTION_SUMMARY_PREFIX =
  "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
export const COMPACTION_SUMMARY_SUFFIX = "\n</summary>";
export const BRANCH_SUMMARY_PREFIX =
  "The following is a summary of a branch that this conversation came back from:\n\n<summary>\n";
export const BRANCH_SUMMARY_SUFFIX = "</summary>";

// ─── Category metadata ────────────────────────────────────────────────────────

/** The 12 known context-bucket categories. */
export type ContextBucketKind =
  | "system"
  | "toolSchemas"
  | "user"
  | "assistant"
  | "thinking"
  | "toolCalls"
  | "toolResults"
  | "bash"
  | "summaries"
  | "custom"
  | "images"
  | "providerDelta";

/** Export the legacy alias for backward compat during refactoring. */
export type CategoryId = ContextBucketKind;

export const CATEGORY_META = {
  system: {
    label: "System prompt",
    shortLabel: "System",
    color: "#8b5cf6",
    description:
      "Current system prompt, project instructions, loaded guidance, and extension-added prompt text.",
  },
  toolSchemas: {
    label: "Tool schemas",
    shortLabel: "Tools",
    color: "#06b6d4",
    description:
      "Active tool definitions, descriptions, and JSON schemas sent to the provider.",
  },
  user: {
    label: "User messages",
    shortLabel: "User",
    color: "#22c55e",
    description:
      "Your prompts and user-role text that stays in the active conversation.",
  },
  assistant: {
    label: "Assistant responses",
    shortLabel: "Assistant",
    color: "#60a5fa",
    description: "Visible assistant text responses kept in context.",
  },
  thinking: {
    label: "Assistant thinking",
    shortLabel: "Thinking",
    color: "#f97316",
    description:
      "Reasoning/thinking blocks returned by reasoning models when present in the session.",
  },
  toolCalls: {
    label: "Tool calls",
    shortLabel: "Calls",
    color: "#facc15",
    description:
      "Assistant tool-call arguments, including paths, commands, and edit payloads.",
  },
  toolResults: {
    label: "Tool results",
    shortLabel: "Results",
    color: "#ef4444",
    description:
      "Tool output returned to the model, usually the largest contributor in coding sessions.",
  },
  bash: {
    label: "User bash",
    shortLabel: "Bash",
    color: "#a3e635",
    description:
      "User-run ! bash commands and their outputs when included in model context.",
  },
  summaries: {
    label: "Summaries",
    shortLabel: "Summaries",
    color: "#ec4899",
    description: "Compaction and branch summaries replacing earlier history.",
  },
  custom: {
    label: "Custom context",
    shortLabel: "Custom",
    color: "#14b8a6",
    description:
      "Extension-injected custom messages that participate in context.",
  },
  images: {
    label: "Images",
    shortLabel: "Images",
    color: "#f59e0b",
    description:
      "Image blocks, estimated conservatively because providers tokenize images differently.",
  },
  providerDelta: {
    label: "Provider / serialization delta",
    shortLabel: "Delta",
    color: "#64748b",
    description:
      "Unattributed difference between local estimates and pi's footer-compatible provider total.",
  },
} as const;

// ─── Context bucket types (high-level, token-hygiene-facing) ─────────────────

/**
 * Whether a bucket's content is actually sent to the model, excluded, or a
 * reconciliation artefact.
 */
export type ContextVisibility = "visible" | "excluded" | "delta";

/** A single analysed context bucket. */
export interface ContextBucket {
  kind: ContextBucketKind;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
  tokens: number;
  displayTokens: number;
  percent: number;
  segments: number;
  visibility: ContextVisibility;
}

/** Result of a full analyseContextBuckets() call. */
export interface ContextBucketAnalysis {
  buckets: ContextBucket[];
  totalTokens: number;
  totalSegments: number;
  providerDeltaTokens: number;
  reconciliationScale: number;
}

// ─── Shared segment-level types (used by context-inspector.ts) ────────────────

export type ContextSegment = {
  category: ContextBucketKind;
  tokens: number;
  chars: number;
  excluded?: boolean | undefined;
};

export type MinimalContentBlock = {
  type?: string | undefined;
  text?: string | undefined;
  thinking?: string | undefined;
  name?: string | undefined;
  id?: string | undefined;
  arguments?: Record<string, unknown> | undefined;
  data?: string | undefined;
  mimeType?: string | undefined;
  source?: {
    type?: string | undefined;
    mediaType?: string | undefined;
    data?: string | undefined;
  };
};

export type MinimalMessage = {
  role?: string | undefined;
  content?: unknown | undefined;
  timestamp?: number | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  stopReason?: string | undefined;
  usage?: unknown | undefined;
  toolCallId?: string | undefined;
  toolName?: string | undefined;
  details?: unknown | undefined;
  customType?: string | undefined;
  display?: boolean | undefined;
  summary?: string | undefined;
  fromId?: string | undefined;
  tokensBefore?: number | undefined;
  command?: string | undefined;
  output?: string | undefined;
  exitCode?: number | undefined;
  cancelled?: boolean | undefined;
  truncated?: boolean | undefined;
  fullOutputPath?: string | undefined;
  excludeFromContext?: boolean | undefined;
};

export type MinimalEntry = {
  type?: string | undefined;
  id?: string | undefined;
  parentId?: string | null | undefined;
  timestamp?: string | undefined;
  message?: MinimalMessage | undefined;
  customType?: string | undefined;
  content?: unknown | undefined;
  display?: boolean | undefined;
  details?: unknown | undefined;
  summary?: string | undefined;
  fromId?: string | undefined;
  tokensBefore?: number | undefined;
  firstKeptEntryId?: string | undefined;
};

export type Segment = {
  id: string;
  category: ContextBucketKind;
  label: string;
  source: string;
  role: string;
  tokens: number;
  chars: number;
  turn: number;
  sequence: number;
  entryId?: string | undefined;
  timestamp?: string | undefined;
  toolName?: string | undefined;
  toolCallId?: string | undefined;
  path?: string | undefined;
  command?: string | undefined;
  excluded?: boolean | undefined;
  displayOnly?: boolean | undefined;
  preview: string;
  detail: string;
  note?: string | undefined;
};

export type CategoryStat = {
  id: ContextBucketKind;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
  tokens: number;
  displayTokens: number;
  percent: number;
  segments: number;
};

export type AggregateStat = {
  key: string;
  label: string;
  tokens: number;
  segments: number;
  percent: number;
};

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fast character-based token estimation (~1 token per 4 chars).
 * Returns 0 for empty/null/undefined input.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Human-readable label for a context bucket kind.
 */
export function formatBucketName(kind: ContextBucketKind): string {
  return CATEGORY_META[kind].label;
}

/**
 * Group raw segments into per-bucket stats.
 *
 * @param segments - Flat array of segment-like objects (minimally {category, tokens, chars, excluded})
 * @param authoritativeTokens - Optional provider-reported token total; when higher than visible sum a
 *                              "providerDelta" bucket is appended.
 */
export function analyseContextBuckets(
  segments: ContextSegment[],
  authoritativeTokens?: number | null,
): ContextBucketAnalysis {
  if (!segments.length) {
    return {
      buckets: [],
      totalTokens: 0,
      totalSegments: 0,
      providerDeltaTokens: 0,
      reconciliationScale: 1,
    };
  }

  // 1. Group by category
  const byCategory = new Map<
    ContextBucketKind,
    { tokens: number; segments: number; excluded: boolean }
  >();

  for (const segment of segments) {
    const current = byCategory.get(segment.category) ?? {
      tokens: 0,
      segments: 0,
      excluded: true,
    };
    current.tokens += segment.tokens;
    current.segments++;
    // If ANY segment in a bucket is non-excluded, the bucket is "visible"
    if (!segment.excluded) current.excluded = false;
    byCategory.set(segment.category, current);
  }

  // 2. Calculate raw totals and work out provider delta
  const visibleRawTokens = Array.from(byCategory.entries())
    .filter(([, stat]) => !stat.excluded)
    .reduce((sum, [, stat]) => sum + stat.tokens, 0);
  const providerDeltaTokens =
    authoritativeTokens != null
      ? Math.max(0, Math.round(authoritativeTokens - visibleRawTokens))
      : 0;
  const reconciliationScale =
    authoritativeTokens != null &&
    visibleRawTokens > authoritativeTokens &&
    visibleRawTokens > 0
      ? authoritativeTokens / visibleRawTokens
      : 1;
  const displayTotal = authoritativeTokens ?? visibleRawTokens;

  // 3. Add provider delta as a synthetic bucket
  if (providerDeltaTokens > 0) {
    byCategory.set("providerDelta", {
      tokens: providerDeltaTokens,
      segments: 1,
      excluded: false,
    });
  }

  // 4. Build bucket list
  const totalSegments = segments.length;
  const allBuckets: ContextBucket[] = [];

  for (const [kind, stat] of byCategory) {
    const meta = CATEGORY_META[kind];
    const rawTokens = stat.tokens;
    const displayTokens =
      kind === "providerDelta"
        ? rawTokens
        : Math.round(rawTokens * reconciliationScale);
    const percent = displayTotal > 0 ? (displayTokens / displayTotal) * 100 : 0;
    const visibility: ContextVisibility =
      kind === "providerDelta"
        ? "delta"
        : stat.excluded
          ? "excluded"
          : "visible";

    allBuckets.push({
      kind,
      label: meta.label,
      shortLabel: meta.shortLabel,
      color: meta.color,
      description: meta.description,
      tokens: Math.round(rawTokens),
      displayTokens,
      percent,
      segments: stat.segments,
      visibility,
    });
  }

  // 5. Sort descending by displayTokens
  allBuckets.sort((a, b) => b.displayTokens - a.displayTokens);

  return {
    buckets: allBuckets,
    totalTokens: Math.round(displayTotal),
    totalSegments,
    providerDeltaTokens,
    reconciliationScale,
  };
}

// ─── Shared helper utilities ──────────────────────────────────────────────────

export function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null || !Number.isFinite(tokens)) return "?";
  const rounded = Math.round(tokens);
  if (Math.abs(rounded) < 1000) return rounded.toLocaleString();
  if (Math.abs(rounded) < 10_000) return `${(rounded / 1000).toFixed(1)}k`;
  if (Math.abs(rounded) < 1_000_000)
    return `${Math.round(rounded / 1000).toLocaleString()}k`;
  return `${(rounded / 1_000_000).toFixed(1)}M`;
}

export function makeDetail(text: string, redact: boolean): string {
  if (redact)
    return text ? `[redacted ${text.length.toLocaleString()} characters]` : "";
  if (text.length <= DETAIL_TEXT_LIMIT) return text;
  return `${text.slice(0, DETAIL_TEXT_LIMIT)}\n\n[… ${(
    text.length - DETAIL_TEXT_LIMIT
  ).toLocaleString()} more characters omitted from the report]`;
}

export function makePreview(text: string, redact: boolean): string {
  if (redact)
    return text ? `[redacted ${text.length.toLocaleString()} chars]` : "";
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= PREVIEW_TEXT_LIMIT) return compact;
  return `${compact.slice(0, PREVIEW_TEXT_LIMIT)}…`;
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getContentBlocks(content: unknown): MinimalContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord) as MinimalContentBlock[];
}

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string")
      parts.push(block.text);
  }
  return parts.join("\n");
}

export function extractLikelyPath(
  args: Record<string, unknown> | undefined,
): string | undefined {
  if (!args) return undefined;
  for (const key of [
    "path",
    "file",
    "filePath",
    "target",
    "cwd",
    "glob",
  ] as const) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

export function extractLikelyCommand(
  args: Record<string, unknown> | undefined,
): string | undefined {
  const value = args?.command;
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function isoTimestamp(
  message: MinimalMessage,
  entry?: MinimalEntry,
): string | undefined {
  if (
    typeof message.timestamp === "number" &&
    Number.isFinite(message.timestamp)
  ) {
    return new Date(message.timestamp).toISOString();
  }
  return entry?.timestamp;
}

export function safeCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
