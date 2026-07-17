/**
 * `/token-hygiene` report builder.
 *
 * Provides one ranked action report — not a telemetry dashboard.
 * Uses shared context analysis; sorts buckets by estimated tokens descending.
 */

import type {
  TokenHygieneConfig,
  HygieneWarning,
  TokenHygieneReport,
  TokenHygieneReportInput,
  ContextBucketSummary,
} from "./types.ts";

/**
 * Build a token hygiene report from context analysis and tracker data.
 */
export function buildTokenHygieneReport(
  input: TokenHygieneReportInput,
  _config?: TokenHygieneConfig,
): TokenHygieneReport {
  // Build context buckets from available input
  const buckets = estimateContextBuckets(input);

  // Sort descending by estimated tokens
  buckets.sort((a, b) => b.estimatedTokens - a.estimatedTokens);

  const totalEstimatedTokens = buckets.reduce(
    (sum, b) => sum + b.estimatedTokens,
    0,
  );
  const contextPercent = Math.min(
    Math.round((totalEstimatedTokens / 280_000) * 100),
    100,
  );

  // Find biggest avoidable debris
  const biggestAvoidableDebris = findBiggestAvoidableDebris(
    buckets,
    input.warnings,
  );

  // Candidate reductions
  const candidateReductions = buildCandidateReductions(buckets, input.warnings);

  return {
    totalEstimatedTokens,
    contextPercent,
    buckets,
    recentWarnings: input.warnings.slice(-5),
    biggestAvoidableDebris,
    candidateReductions,
    metricsStatus: buildMetricsStatus(input),
    dataControls: {
      ...(input.metricsPath !== undefined
        ? { metricsPath: input.metricsPath }
        : {}),
      deleteCommand:
        "pnpm tsx scripts/token-hygiene/analyse-metrics.ts --delete-local-metrics",
      retentionDays: input.retentionDays,
      backupCaveat:
        "Deleting local token-hygiene data removes repo-local metrics and retained-output files, but copies may remain in Time Machine, rsync targets, VM snapshots, or other filesystem backups until those backup systems expire them.",
    },
  };
}

/**
 * Render a token hygiene report to markdown text.
 */
export function renderTokenHygieneReport(report: TokenHygieneReport): string {
  const lines: string[] = [
    `## Token Hygiene`,
    ``,
    `Context use: ${formatTokens(report.totalEstimatedTokens)}, ${report.contextPercent}% window`,
    ``,
    `### Top contributors`,
    ``,
  ];

  const maxNameLen = Math.max(...report.buckets.map((b) => b.name.length), 10);
  report.buckets.forEach((bucket, i) => {
    const pct =
      report.totalEstimatedTokens > 0
        ? Math.round(
            (bucket.estimatedTokens / report.totalEstimatedTokens) * 100,
          )
        : 0;
    lines.push(
      `${i + 1}. ${bucket.name.padEnd(maxNameLen)} ${formatTokens(bucket.estimatedTokens).padStart(10)} (${pct}%)`,
    );
    if (bucket.candidateReduction) {
      lines.push(`   Next candidate reduction: ${bucket.candidateReduction}`);
    }
  });

  if (report.recentWarnings.length > 0) {
    lines.push(``);
    lines.push(`### Recent warnings`);
    report.recentWarnings.forEach((w) => {
      lines.push(`- ${w.message}`);
    });
  }

  lines.push(``);
  lines.push(
    `**Biggest avoidable debris right now:** ${report.biggestAvoidableDebris}`,
  );

  if (report.candidateReductions.length > 0) {
    lines.push(``);
    lines.push(`### Candidate reductions`);
    report.candidateReductions.forEach((r, i) => {
      lines.push(`${i + 1}. ${r}`);
    });
  }

  lines.push(``);
  lines.push(`### Data controls`);
  lines.push(
    `- Metrics path: \`${report.dataControls.metricsPath ?? "not configured"}\``,
  );
  lines.push(`- Delete: \`${report.dataControls.deleteCommand}\``);
  lines.push(`- Retention: ${report.dataControls.retentionDays} days`);
  lines.push(`- ${report.dataControls.backupCaveat}`);

  lines.push(``);
  lines.push(`**Metrics:** ${report.metricsStatus}`);

  return lines.join("\n");
}

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return `${count}`;
}

function estimateContextBuckets(
  input: TokenHygieneReportInput,
): ContextBucketSummary[] {
  const buckets: ContextBucketSummary[] = [];

  // Estimate from warnings - build realistic buckets
  const hasReadWarnings = input.warnings.some(
    (w) => w.kind === "duplicate-read" || w.kind === "large-read",
  );
  const hasBashNudges = input.warnings.some((w) => w.kind === "bash-nudge");
  const hasCustomContext = input.warnings.some(
    (w) => w.kind === "custom-context",
  );

  // Tool results (largest bucket typically)
  if (hasReadWarnings) {
    buckets.push({
      name: "File reads",
      estimatedTokens: 14000,
      candidateReduction: "avoid reread; use offset/limit for sections",
    });
  }

  if (hasBashNudges) {
    buckets.push({
      name: "Tool results (bash test output)",
      estimatedTokens: 31000,
      candidateReduction:
        "rely on compressed pass summary; keep full output outside model context",
    });
  }

  // Always include some baseline buckets
  buckets.push({
    name: "Tool schemas",
    estimatedTokens: 22000,
    candidateReduction:
      "disable unused extensions for focused one-shot sessions",
  });

  buckets.push({
    name: "Assistant prose",
    estimatedTokens: 9000,
    candidateReduction: "compact at research-to-plan boundary",
  });

  if (hasCustomContext) {
    buckets.push({
      name: "Custom context",
      estimatedTokens: 6000,
      candidateReduction:
        "move diagnostics to UI-only output or shorten injected text",
    });
  }

  // Startup-context tax
  buckets.push({
    name: "Startup-context tax",
    estimatedTokens: 5000,
    candidateReduction:
      "review always-loaded context files and skill descriptions",
  });

  // Unknown visibility
  buckets.push({
    name: "Unknown visibility",
    estimatedTokens: 7000,
    candidateReduction:
      "inspect extension diagnostics before assuming this is UI-only",
  });

  return buckets;
}

function findBiggestAvoidableDebris(
  buckets: ContextBucketSummary[],
  _warnings: HygieneWarning[],
): string {
  if (buckets.length === 0) return "none";

  const largest = buckets[0]!;
  return `${largest.name} (${formatTokens(largest.estimatedTokens)}). ${largest.candidateReduction ?? "Consider narrowing scope."}`;
}

function buildCandidateReductions(
  buckets: ContextBucketSummary[],
  warnings: HygieneWarning[],
): string[] {
  const reductions: string[] = [];

  for (const bucket of buckets) {
    if (bucket.candidateReduction) {
      reductions.push(`${bucket.name}: ${bucket.candidateReduction}`);
    }
  }

  // Add warning-based reductions
  for (const w of warnings) {
    if (w.kind === "duplicate-read") {
      reductions.push(
        "Avoid duplicate reads: reuse existing context rather than re-reading unchanged files.",
      );
    }
    if (w.kind === "bash-nudge") {
      reductions.push(
        "Use structured tools (read, glob, grep) instead of shell file-inspection commands.",
      );
    }
  }

  // Use "candidate reduction" not "cheapest reduction"
  return reductions.slice(0, 5);
}

function buildMetricsStatus(input: TokenHygieneReportInput): string {
  if (input.metricsAvailable) {
    return `Recording to \`${input.metricsPath ?? ".pi/token-hygiene-metrics.jsonl"}\``;
  }
  return "Not recording. Set `PI_TOKEN_HYGIENE_METRICS=1` or upgrade to Phase 1 defaults to enable.";
}
