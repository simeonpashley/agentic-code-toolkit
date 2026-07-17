#!/usr/bin/env tsx
/**
 * Token hygiene metrics analyser.
 *
 * Reads a JSONL metrics file and produces a structured analysis report.
 * Supports CLI flags for markdown output, metrics deletion, and unsafe
 * identifier inclusion.
 *
 * Usage:
 *   tsx scripts/token-hygiene/analyse-metrics.ts [--markdown] [--help] [--delete-local-metrics] [--unsafe-include-identifiers] [<metrics-file>]
 */
import { existsSync } from "node:fs";
import type {
  ParsedMetricRecord,
  MalformedLineInfo,
} from "../../extensions/token-hygiene/metrics.ts";
import {
  readMetricsFile,
  deleteLocalMetrics,
} from "../../extensions/token-hygiene/metrics.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnalyseOptions {
  /** Malformed lines found when reading the metrics file. */
  malformedLines?: MalformedLineInfo[];
  /** When true, include raw identifiers (paths, patterns, queries, URLs) in output. */
  includeIdentifiers?: boolean;
}

export interface AnalyseResult {
  totalEvents: number;
  totalMalformedLines: number;
  /** ISO timestamp of first and last event, or null if no events. */
  timestampRange: { first: string; last: string } | null;
  /** Count of events per type. */
  eventTypeCounts: Record<string, number>;
  /** Number of redaction_failure events. */
  redactionFailureCount: number;
  /** Sum of chars fields across all events, or null if none have it. */
  totalEstimatedTokens: number | null;
  /** Total tool_call events. */
  toolCallCount: number;
  /** Count of tool calls per toolName. */
  toolUsage: Record<string, number>;
  /** Raw identifiers from tool_call inputs, only populated with includeIdentifiers. */
  identifiers?: string[];
}

export interface CliOptions {
  help?: boolean;
  markdown?: boolean;
  deleteLocalMetrics?: boolean;
  unsafeIncludeIdentifiers?: boolean;
  metricsFile?: string;
}

const DEFAULT_METRICS_PATH = ".pi/token-hygiene-metrics.jsonl";

// ── Core analysis ────────────────────────────────────────────────────────────

export function analyseMetrics(
  events: ParsedMetricRecord[],
  options: AnalyseOptions = {},
): AnalyseResult {
  const malformedLines = options.malformedLines ?? [];
  const includeIdentifiers = options.includeIdentifiers ?? false;

  const totalEvents = events.length;
  const totalMalformedLines = malformedLines.length;

  // Event type counts
  const eventTypeCounts: Record<string, number> = {};
  let redactionFailureCount = 0;
  let totalChars = 0;
  let charsCount = 0;
  let toolCallCount = 0;
  const toolUsage: Record<string, number> = {};
  const identifiers: string[] = [];

  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;

  for (const record of events) {
    const data = record.data;
    const type = typeof data.type === "string" ? data.type : "unknown";

    // Count by type
    eventTypeCounts[type] = (eventTypeCounts[type] ?? 0) + 1;

    // Redaction failures
    if (type === "redaction_failure") {
      redactionFailureCount++;
    }

    // Track timestamps
    const ts = data.timestamp;
    if (typeof ts === "string") {
      if (firstTimestamp === null || ts < firstTimestamp) {
        firstTimestamp = ts;
      }
      if (lastTimestamp === null || ts > lastTimestamp) {
        lastTimestamp = ts;
      }
    }

    // Sum chars as estimated tokens
    const chars = data.chars;
    if (typeof chars === "number") {
      totalChars += chars;
      charsCount++;
    }

    // Tool calls
    if (type === "tool_call") {
      toolCallCount++;
      const toolName =
        typeof data.toolName === "string" ? data.toolName : "unknown";
      toolUsage[toolName] = (toolUsage[toolName] ?? 0) + 1;

      // Collect identifiers if requested
      if (includeIdentifiers) {
        const input = data.input as Record<string, unknown> | undefined;
        if (input) {
          if (typeof input.path === "string") {
            identifiers.push(input.path);
          }
          if (typeof input.pattern === "string") {
            identifiers.push(input.pattern);
          }
          if (typeof input.query === "string") {
            identifiers.push(input.query);
          }
          if (typeof input.url === "string") {
            identifiers.push(input.url);
          }
        }
      }
    }
  }

  return {
    totalEvents,
    totalMalformedLines,
    timestampRange:
      firstTimestamp && lastTimestamp
        ? { first: firstTimestamp, last: lastTimestamp }
        : null,
    eventTypeCounts,
    redactionFailureCount,
    totalEstimatedTokens: charsCount > 0 ? totalChars : null,
    toolCallCount,
    toolUsage,
    ...(includeIdentifiers ? { identifiers } : {}),
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatMarkdown(result: AnalyseResult): string {
  const lines: string[] = [];

  lines.push("# Token Hygiene Metrics Analysis");
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total Events | ${result.totalEvents} |`);
  lines.push(`| Malformed Lines | ${result.totalMalformedLines} |`);
  lines.push(`| Redaction Failures | ${result.redactionFailureCount} |`);
  lines.push(
    `| Estimated Tokens (chars) | ${result.totalEstimatedTokens ?? "N/A"} |`,
  );
  lines.push(`| Tool Calls | ${result.toolCallCount} |`);

  if (result.timestampRange) {
    lines.push(`| First Event | ${result.timestampRange.first} |`);
    lines.push(`| Last Event | ${result.timestampRange.last} |`);
  }

  lines.push("");

  // Event type breakdown
  const typeKeys = Object.keys(result.eventTypeCounts).sort();
  if (typeKeys.length > 0) {
    lines.push("## Events by Type");
    lines.push("");
    lines.push("| Type | Count |");
    lines.push("|------|-------|");
    for (const type of typeKeys) {
      lines.push(`| ${type} | ${result.eventTypeCounts[type]!} |`);
    }
    lines.push("");
  }

  // Tool usage breakdown
  const toolKeys = Object.keys(result.toolUsage).sort();
  if (toolKeys.length > 0) {
    lines.push("## Tool Usage");
    lines.push("");
    lines.push("| Tool | Calls |");
    lines.push("|------|-------|");
    for (const tool of toolKeys) {
      lines.push(`| ${tool} | ${result.toolUsage[tool]!} |`);
    }
    lines.push("");
  }

  // Identifiers (unsafe)
  if (result.identifiers && result.identifiers.length > 0) {
    lines.push("## Identifiers (raw)");
    lines.push("");
    lines.push("> ⚠️ These are raw identifiers from tool_call inputs.");
    lines.push("> They include paths, patterns, queries, and URLs.");
    lines.push("");
    for (const id of result.identifiers) {
      lines.push(`- \`${id}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Delete metrics ───────────────────────────────────────────────────────────

export function deleteMetricsFile(metricsPath: string): boolean {
  if (!existsSync(metricsPath)) {
    return false;
  }
  deleteLocalMetrics({ metricsPath });
  return true;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

export function printHelp(): string {
  return `Usage: analyse-metrics [options] [metrics-file]

Analyse token hygiene metrics gathered during Pi sessions.

Options:
  --help                        Show this help message and exit.
  --markdown                    Output analysis as markdown (default: text).
  --delete-local-metrics        Delete the metrics file after analysis.
  --unsafe-include-identifiers  Include raw identifiers (paths, patterns, queries, URLs).
                                Rejected when CI environment is detected.

If no metrics file is specified, reads from: ${DEFAULT_METRICS_PATH}

Examples:
  tsx scripts/token-hygiene/analyse-metrics.ts
  tsx scripts/token-hygiene/analyse-metrics.ts --markdown
  tsx scripts/token-hygiene/analyse-metrics.ts --delete-local-metrics /path/to/metrics.jsonl
`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  const args = argv.slice(2);

  for (const arg of args) {
    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--markdown") {
      options.markdown = true;
    } else if (arg === "--delete-local-metrics") {
      options.deleteLocalMetrics = true;
    } else if (arg === "--unsafe-include-identifiers") {
      options.unsafeIncludeIdentifiers = true;
    } else if (!arg.startsWith("--")) {
      options.metricsFile = arg;
    }
  }

  return options;
}

function main(): void {
  const options = parseArgs(process.argv);

  if (options.help) {
    console.log(printHelp());
    process.exit(0);
  }

  // Reject --unsafe-include-identifiers in CI
  if (options.unsafeIncludeIdentifiers && process.env.CI) {
    console.error(
      "ERROR: --unsafe-include-identifiers is not allowed in CI environments.",
    );
    process.exit(1);
  }

  const metricsPath = options.metricsFile ?? DEFAULT_METRICS_PATH;

  if (!existsSync(metricsPath)) {
    console.error(`ERROR: Metrics file not found: ${metricsPath}`);
    process.exit(1);
  }

  const { events, malformedLines } = readMetricsFile(metricsPath);

  const result = analyseMetrics(events, {
    malformedLines,
    includeIdentifiers: options.unsafeIncludeIdentifiers ?? false,
  });

  if (options.markdown) {
    console.log(formatMarkdown(result));
  } else {
    // Plain text output
    console.log(`Token Hygiene Metrics Analysis`);
    console.log(`============================\n`);
    console.log(`Total Events:          ${result.totalEvents}`);
    console.log(`Malformed Lines:       ${result.totalMalformedLines}`);
    console.log(`Redaction Failures:    ${result.redactionFailureCount}`);
    console.log(
      `Estimated Tokens:      ${result.totalEstimatedTokens ?? "N/A"}`,
    );
    console.log(`Tool Calls:            ${result.toolCallCount}`);

    if (result.timestampRange) {
      console.log(`First Event:           ${result.timestampRange.first}`);
      console.log(`Last Event:            ${result.timestampRange.last}`);
    }

    const typeKeys = Object.keys(result.eventTypeCounts).sort();
    if (typeKeys.length > 0) {
      console.log(`\nEvents by Type:`);
      for (const type of typeKeys) {
        console.log(`  ${type}: ${result.eventTypeCounts[type]}`);
      }
    }

    const toolKeys = Object.keys(result.toolUsage).sort();
    if (toolKeys.length > 0) {
      console.log(`\nTool Usage:`);
      for (const tool of toolKeys) {
        console.log(`  ${tool}: ${result.toolUsage[tool]}`);
      }
    }
  }

  // Delete metrics if requested
  if (options.deleteLocalMetrics) {
    deleteMetricsFile(metricsPath);
  }
}

// Allow importing the pure functions for testing while also being runnable as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
