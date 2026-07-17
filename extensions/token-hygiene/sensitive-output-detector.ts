/**
 * Conservative sensitive-output detector.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md
 *
 * Classifies output as:
 *   - "not-sensitive" — safe to retain/compress
 *   - "sensitive" — contains known secret patterns; must not be retained/compressed
 *   - "unknown" — cannot determine safety; must fail closed like "sensitive"
 *
 * The detector shares the redaction pattern corpus from redaction.ts and
 * normalizes text before matching. Non-UTF-8, undecodable, binary-like,
 * or extremely long outputs are classified as "unknown".
 */

import { redactText } from "./redaction";

export type SensitivityClassification =
  "sensitive" | "not-sensitive" | "unknown";

// Thresholds for classification heuristics
const MAX_REASONABLE_CHARS = 500_000;
const MIN_PRINTABLE_RATIO = 0.9;

/**
 * Classify output for sensitive content.
 *
 * Returns:
 *   - "sensitive" — the output matches known secret patterns
 *   - "not-sensitive" — the output appears safe
 *   - "unknown" — the output cannot be safely classified
 *
 * Both "sensitive" and "unknown" are considered fail-closed:
 * the output must not be stored, retained, or compressed.
 */
export function classifySensitiveOutput(
  output: string,
): SensitivityClassification {
  // Empty or whitespace-only is not sensitive
  if (!output || output.trim().length === 0) {
    return "not-sensitive";
  }

  // Extremely long output is unknown (likely binary stream or encoded data)
  if (output.length > MAX_REASONABLE_CHARS) {
    return "unknown";
  }

  // Check for non-UTF-8 / binary content
  if (!isValidUtf8(output) || !isSufficientlyReadable(output)) {
    return "unknown";
  }

  // Check against known secret patterns via redactText
  const redactionResult = redactText(output);
  if (redactionResult.count > 0) {
    return "sensitive";
  }

  // Check for SSH key material (not always caught by PEM patterns)
  if (looksLikeSshKey(output)) {
    return "sensitive";
  }

  return "not-sensitive";
}

/**
 * Check if a string round-trips cleanly through UTF-8 encoding/decoding.
 */
function isValidUtf8(text: string): boolean {
  try {
    const encoded = Buffer.from(text, "utf-8");
    const decoded = encoded.toString("utf-8");
    return decoded === text;
  } catch {
    return false;
  }
}

/**
 * Check if the output contains a sufficient proportion of readable text.
 */
function isSufficientlyReadable(text: string): boolean {
  let printableCount = 0;
  const total = text.length;
  const sample = text.slice(0, Math.min(total, 10_000)); // Sample first 10k chars

  for (let i = 0; i < sample.length; i++) {
    const code = sample.codePointAt(i)!;
    // Allow printable ASCII, extended Unicode, and common whitespace
    if (
      (code >= 0x20 && code <= 0x7e) || // printable ASCII
      code >= 0xa0 || // extended Unicode
      code === 0x09 || // tab
      code === 0x0a || // newline
      code === 0x0d // carriage return
    ) {
      printableCount++;
    }
    // Skip surrogate pairs
    if (code >= 0xd800 && code <= 0xdfff) i++;
  }

  return printableCount / sample.length >= MIN_PRINTABLE_RATIO;
}

/**
 * Detect SSH public/private key material that might not match PEM patterns.
 */
function looksLikeSshKey(text: string): boolean {
  // SSH public keys
  if (/ssh-(rsa|dss|ed25519|ecdsa)\s+[A-Za-z0-9+/=]{50,}/.test(text)) {
    return true;
  }
  // SSH private key headers
  if (/-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/.test(text)) {
    return true;
  }
  return false;
}
