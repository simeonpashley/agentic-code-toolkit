/**
 * Top-Tool-Results Processor
 *
 * Reads metrics JSONL and returns the top N tools by total estimated
 * result tokens. This is a standalone processor that works with the
 * spec-defined metrics JSONL format without depending on other
 * token-hygiene infrastructure.
 *
 * Usage:
 *   import { computeTopToolResults } from "./top-tool-results.ts";
 *   const results = computeTopToolResults(jsonlContent, 20);
 *   for (const r of results) {
 *     console.log(`${r.toolName}: ${r.totalTokens} tokens (${r.totalCalls} calls)`);
 *   }
 */

export interface ToolResultSummary {
  /** Tool name (e.g. "read", "bash", "grep") */
  toolName: string;
  /** Sum of estimatedTokens across all tool_result events for this tool */
  totalTokens: number;
  /** Total number of tool_result events for this tool */
  totalCalls: number;
  /** Number of tool_result events where isError is true */
  errorCalls: number;
}

/**
 * Compute the top N tools by total estimated result tokens from
 * metrics JSONL content.
 *
 * @param jsonlContent  Raw JSONL text (one JSON object per line)
 * @param topN          Number of results to return (default: 20)
 * @returns             Array sorted by totalTokens descending
 */
export function computeTopToolResults(
  jsonlContent: string,
  topN: number = 20,
): ToolResultSummary[] {
  if (!jsonlContent || topN <= 0) {
    return [];
  }

  const toolTokens = new Map<
    string,
    { tokens: number; calls: number; errors: number }
  >();

  for (const line of jsonlContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Skip malformed lines
      continue;
    }

    if (parsed.event !== "tool_result") continue;
    const toolName =
      typeof parsed.toolName === "string" ? parsed.toolName : "unknown";
    const estimatedTokens = Number(parsed.estimatedTokens ?? 0);
    const isError = parsed.isError === true;

    let entry = toolTokens.get(toolName);
    if (!entry) {
      entry = { tokens: 0, calls: 0, errors: 0 };
      toolTokens.set(toolName, entry);
    }

    // Guard against NaN from malformed numeric values
    entry.tokens += Number.isFinite(estimatedTokens)
      ? Math.max(0, estimatedTokens)
      : 0;
    entry.calls += 1;
    if (isError) entry.errors += 1;
  }

  const results: ToolResultSummary[] = [];
  for (const [toolName, entry] of toolTokens) {
    results.push({
      toolName,
      totalTokens: entry.tokens,
      totalCalls: entry.calls,
      errorCalls: entry.errors,
    });
  }

  results.sort((a, b) => b.totalTokens - a.totalTokens);

  return results.slice(0, topN);
}
