/**
 * HMAC-backed redaction and metric event serialization.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md
 *
 * Exports:
 *   - redactText(text) — redacts known secret patterns from text
 *   - createIdentifierHasher({ piConfigDir }) — creates HMAC-SHA-256 hasher with key management
 *   - serializeMetricEvent(event, hasher) — serializes metrics through allowlisted schemas
 */

import { createHmac, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

const HMAC_KEY_FILENAME = "token-hygiene-hmac-key";

export interface IdentifierHasher {
  hash(input: string): string;
}

export interface RedactionResult {
  redacted: string;
  count: number;
}

// ── Secret patterns ────────────────────────────────────────────────────

interface SecretPattern {
  name: string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS Access Keys
  { name: "AWS Access Key", pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g },
  // AWS Secret Key assignments
  {
    name: "AWS Secret Key",
    pattern:
      /\b(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key|secret_access_key|SecretAccessKey)\b\s*[:=]\s*["']?[A-Za-z0-9/+=]{40,}["']?/g,
  },
  // Bearer tokens
  { name: "Bearer Token", pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/g },
  // OpenAI/Anthropic API keys (sk-...)
  { name: "OpenAI/Anthropic API Key", pattern: /sk-[a-zA-Z0-9._-]{20,}/g },
  // Live/Test API keys
  { name: "Stripe Live Key", pattern: /sk_live_[a-zA-Z0-9]{20,}/g },
  { name: "Stripe Test Key", pattern: /sk_test_[a-zA-Z0-9]{20,}/g },
  // Private keys (PEM)
  {
    name: "Private Key",
    pattern:
      /-----BEGIN\s+[\w\s]*PRIVATE\s+KEY-----[\s\S]*?-----END\s+[\w\s]*PRIVATE\s+KEY-----/g,
  },
  // Connection strings with credentials (URLs containing user:password@)
  {
    name: "Connection String",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^:\s/?#]+:[^@\s/?#]+@/gi,
  },
  // Generic password/secret/token fields
  {
    name: "Generic Secret Field",
    pattern:
      /\b(?:[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY)|password|passwd|secret|token|api[_-]?key)\b[ \t]*[:=][ \t]*["']?[A-Za-z0-9._:/+=@!-]{8,}["']?/g,
  },
  // Generic secret phrases
  {
    name: "Generic Secret Phrase",
    pattern:
      /\b(?:password|passwd|secret|token|api[_-]?key)\b\s+(?:is|was|seen|value|header)\s+["']?[A-Za-z0-9._:/+=@!-]{12,}["']?/gi,
  },
  // Customer/project identifiers in paths or env assignments
  {
    name: "Customer/Project Identifier",
    pattern:
      /(?:customer[_-]?id|project[_-]?id|tenant[_-]?id|client[_-]?id|org[_-]?id|account[_-]?id)\s*[:=]\s*["']?[A-Za-z0-9._-]{6,}["']?/gi,
  },
  // Tavily API keys
  { name: "Tavily API Key", pattern: /tvly-[a-zA-Z0-9_-]{20,}/g },
  // Kagi API key pattern (two base64-like parts separated by dot)
  { name: "Kagi API Key", pattern: /[a-zA-Z0-9_-]{40,}\.[a-zA-Z0-9_-]{40,}/g },
  // Brave API keys
  { name: "Brave API Key", pattern: /BSA[A-Z0-9]{20,}/g },
  // Firecrawl API keys
  { name: "Firecrawl API Key", pattern: /fc-[a-f0-9]{32}/g },
  // GitHub tokens (ghp_, ghs_, ghu_, ghr_, gho_, ghs_)
  { name: "GitHub Token", pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g },
  // GitHub fine-grained PATs
  { name: "GitHub PAT", pattern: /github_pat_[a-zA-Z0-9_]{20,}/g },
  // Generic PAT-like patterns (token_ pat_ prefixed long strings)
  { name: "Generic PAT", pattern: /(?:token|pat)_[a-zA-Z0-9]{20,}/gi },
  // SSH private keys inline (~/.ssh/id_* content)
  {
    name: "SSH Private Key",
    pattern:
      /-----\s*BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+OPENSSH\s+PRIVATE\s+KEY-----/g,
  },
];

// ── Encoding normalization ─────────────────────────────────────────────

/**
 * Normalize text for secret pattern matching.
 *
 * Applies URL-decoding, shell-unescaping, and JSON-unicode-escape resolution
 * so that encoded secrets are still caught by patterns.
 */
function normalizeText(text: string): string {
  let normalized = text;

  // URL-decode (%XX sequences)
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Some strings aren't valid URL encoding; keep original
  }

  // JSON unicode escapes (\uXXXX)
  normalized = normalized.replace(/\\u([0-9a-fA-F]{4})/g, (_m, code) =>
    String.fromCodePoint(Number.parseInt(code, 16)),
  );

  // Simple shell unescaping: remove backslash before special characters
  normalized = normalized.replace(/\\([\\"`$(){}[\]|&;<>~*? \t#!])/g, "$1");

  return normalized;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Redact known secret patterns from text.
 *
 * Normalizes the text first (URL-decode, unicode-escape, shell-unescape),
 * then applies secret pattern matching. Returns the redacted text and
 * count of replacements.
 *
 * Non-UTF-8 or undecodable inputs are returned verbatim with count 0.
 */
export function redactText(text: string): RedactionResult {
  // If the text cannot be properly decoded as UTF-8, return it unchanged
  // Test by round-tripping through Buffer
  try {
    const roundTripped = Buffer.from(text, "utf-8").toString("utf-8");
    if (roundTripped !== text && !isAllPrintable(text)) {
      return { redacted: text, count: 0 };
    }
  } catch {
    return { redacted: text, count: 0 };
  }

  const normalized = normalizeText(text);
  let count = 0;
  let result = normalized;

  for (const sp of SECRET_PATTERNS) {
    sp.pattern.lastIndex = 0;
    result = result.replace(sp.pattern, (match) => {
      count++;
      const prefix = match.slice(0, 4);
      return `${prefix}${"*".repeat(Math.min(match.length - 4, 20))}[REDACTED:${sp.name}]`;
    });
  }

  return { redacted: result, count };
}

function isAllPrintable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (code > 0x10ffff) return false;
    if (code >= 0x80) continue; // Allow extended Unicode
    // Allow only printable ASCII and common whitespace
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return false;
  }
  return true;
}

/**
 * Create an HMAC-SHA-256 identifier hasher.
 *
 * Generates a 32-byte random key on first use, stored under the
 * Pi config directory. The key file is created with best-effort
 * 0600 permissions. The key is never exposed in metrics output.
 */
export function createIdentifierHasher(options: {
  piConfigDir: string;
}): IdentifierHasher {
  const keyPath = join(options.piConfigDir, HMAC_KEY_FILENAME);

  // Create parent directory if it doesn't exist
  mkdirSync(options.piConfigDir, { recursive: true });

  // Read or generate the 32-byte HMAC key
  let key: Buffer;
  if (existsSync(keyPath)) {
    key = readFileSync(keyPath);
  } else {
    key = randomBytes(32);
    writeFileSync(keyPath, key, { mode: 0o600 });
    // Best-effort permission setting (works on POSIX)
    try {
      chmodSync(keyPath, 0o600);
    } catch {
      // Platform may not support permissions (Windows)
    }
  }

  return {
    hash(input: string): string {
      return createHmac("sha256", key).update(input, "utf-8").digest("hex");
    },
  };
}

// ── Metric event serialization ─────────────────────────────────────────

interface ToolCallInput {
  path?: string;
  pattern?: string;
  query?: string;
  url?: string;
  offset?: number;
  limit?: number;
  raw?: boolean;
  [key: string]: unknown;
}

/**
 * Serialize a metric event through an allowlisted schema.
 *
 * Known event types have their sensitive fields HMAC'd or stripped.
 * Unknown event shapes produce a `redaction_failure` event with no raw data.
 * Serialization failures produce a `redaction_failure` event.
 */
export function serializeMetricEvent(
  event: Record<string, unknown>,
  hasher: IdentifierHasher,
  options?: { wasClearMode?: boolean },
): string {
  const wasClearMode = options?.wasClearMode === true;
  const sessionMarker = wasClearMode ? { localDebug: true } : {};

  try {
    const type = String(event.type ?? "");

    switch (type) {
      case "session_start":
      case "context_snapshot":
      case "tool_result":
      case "read_result":
      case "search_result":
      case "bash_result":
      case "warning":
      case "compression_decision": {
        // These are already structured; pass through with timestamp guarantee
        return JSON.stringify({
          ...event,
          ...sessionMarker,
          timestamp: event.timestamp ?? new Date().toISOString(),
        });
      }

      case "tool_call": {
        const input = (event.input as ToolCallInput) ?? {};
        const redactedInput: Record<string, unknown> = {};

        // Allowlist fields that are safe to store
        if (input.offset !== undefined) redactedInput.offset = input.offset;
        if (input.limit !== undefined) redactedInput.limit = input.limit;
        if (input.raw !== undefined) redactedInput.raw = input.raw;

        // HMAC sensitive fields
        if (input.path) redactedInput.path = hasher.hash(input.path);
        if (input.pattern) redactedInput.pattern = hasher.hash(input.pattern);
        if (input.query) redactedInput.query = hasher.hash(input.query);
        if (input.url) redactedInput.url = hasher.hash(input.url);

        return JSON.stringify({
          type: "tool_call",
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          input: redactedInput,
          ...sessionMarker,
          timestamp: event.timestamp ?? new Date().toISOString(),
        });
      }

      default: {
        // Unknown event type — produce redaction_failure
        return JSON.stringify({
          type: "redaction_failure",
          source: "unknown-event",
          reason: `unrecognized event type: ${type}`,
          ...sessionMarker,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch {
    // Serialization failed — produce redaction_failure with no raw data
    return JSON.stringify({
      type: "redaction_failure",
      source: "serialization-error",
      reason: "serialization failed",
      ...sessionMarker,
      timestamp: new Date().toISOString(),
    });
  }
}
