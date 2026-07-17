/**
 * Token-hygiene extension entrypoint.
 *
 * All features are live by default: warnings, metrics, and /token-hygiene.
 * Bash output compression is not yet implemented (compressBashSuccesses is false by default).
 *
 * Never mutates tool calls. Tool results are mutated only for retention
 * (large outputs retained to disk with a pointer) and never for content modification.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, sentinelExists, getDisableDiagnostics } from "./config.ts";
import type { TokenHygieneConfig, HygieneWarning } from "./types.ts";
import {
  createReadSearchTracker,
  type ReadSearchTracker,
} from "./read-search-tracker.ts";
import { classifyBashCommand, evaluateLargeRead } from "./bash-nudges.ts";
import {
  compressBashOutput,
  detectCompressorFamily,
} from "./bash-compressors.ts";
import {
  buildTokenHygieneReport,
  renderTokenHygieneReport,
} from "./context-report.ts";
import { classifySensitiveOutput } from "./sensitive-output-detector.ts";
import { createMetricsLogger } from "./metrics.ts";
import type { MetricsLogger } from "./metrics.ts";
import { maybeRetainToolResult, sweepRetainedFiles } from "./retention";
import { cleanThinkingContent } from "./thinking-strip";
export default function tokenHygieneExtension(pi: ExtensionAPI) {
  let config: TokenHygieneConfig;
  let tracker: ReadSearchTracker;
  let metricsLogger: MetricsLogger | null = null;
  let warnings: HygieneWarning[] = [];
  let sessionWarnings: Map<string, boolean> = new Map();

  function emitWarning(warning: HygieneWarning): void {
    warnings.push(warning);
    sessionWarnings.set(
      `${warning.kind}:${warning.callId ?? warning.toolName ?? ""}`,
      true,
    );
  }

  function hasWarned(kind: string, id: string): boolean {
    return sessionWarnings.has(`${kind}:${id}`);
  }

  pi.on("session_start", async (_event, ctx) => {
    const result = loadConfig({
      cwd: process.cwd(),
    });
    config = result.config;
    tracker = createReadSearchTracker(config);
    warnings = [];
    sessionWarnings = new Map();

    // Initialize metrics logger when enabled. Wire onWriteFailure to surface UI warnings.
    if (config.metricsEnabled) {
      try {
        const { serializeMetricEvent, createIdentifierHasher } =
          await import("./redaction.ts");
        const hasher = createIdentifierHasher({ piConfigDir: ".pi" });
        metricsLogger = createMetricsLogger({
          metricsPath: config.metricsPath,
          serializeMetricEvent: (event) => {
            const result = serializeMetricEvent(event, hasher);
            try {
              return JSON.parse(result) as Record<string, unknown>;
            } catch {
              return null;
            }
          },
          identifierMode: config.identifierMode,
          onWriteFailure: (err) => {
            ctx.ui.notify(
              `Token hygiene: failed to write metrics to ${config.metricsPath}: ${err.message}. Token hygiene is not failing.`,
              "warning",
            );
          },
        });
      } catch (err) {
        // Fail-closed: disable metrics if logger cannot be initialized
        ctx.ui.notify(
          `Token hygiene: could not initialize metrics logger: ${err instanceof Error ? err.message : String(err)}.`,
          "warning",
        );
        metricsLogger = null;
      }
    }
    // Sweep retained files from crashed previous sessions
    sweepRetainedFiles(process.cwd());

    // Show disable diagnostics if disabled
    if (!config.enabled || sentinelExists(process.cwd())) {
      ctx.ui.notify(getDisableDiagnostics(config), "warning");
      return;
    }
    // Notify that token hygiene is active
    ctx.ui.notify(
      "Token hygiene active. Warnings for duplicate reads, large reads, bash nudges, and custom-context visibility.",
      "info",
    );
    if (metricsLogger && config.metricsEnabled) {
      metricsLogger.log({
        type: "session_start",
        timestamp: new Date().toISOString(),
        identifierMode: config.identifierMode,
        configVersion: config.configVersion,
        phase: config.phase,
      });
    }
  });

  pi.on("tool_call", async (event) => {
    if (!config.enabled) return;

    // Pre-execution warnings from command shape
    if (config.warnToolChoice && event.toolName === "bash") {
      const command =
        typeof event.input === "object" && event.input !== null
          ? ((event.input as { command?: string }).command ??
            JSON.stringify(event.input))
          : String(event.input);
      const nudge = classifyBashCommand(command);
      if (nudge.classification !== "no-nudge" && nudge.warning) {
        emitWarning({
          kind: "bash-nudge" as const,
          visibility: config.warningVisibility,
          toolName: "bash",
          callId: event.toolCallId,
          message: nudge.warning,
        });
      }
    }
  });

  // ── Retention hook (must fire BEFORE read-search/visibility checks) ──
  pi.on("tool_result", async (event, ctx) => {
    if (!config.enabled) return;
    const result = maybeRetainToolResult(
      event,
      config,
      process.cwd(),
      (msg, level) => ctx.ui.notify(msg, level as "info" | "warning"),
    );
    if (result) {
      // Mutate the event in-place for downstream handlers
      Object.assign(event, result);
    }
  });

  pi.on("tool_result", async (event) => {
    if (!config.enabled) return;
    // Skip if this result was retained — content is a pointer, not real output
    if ((event as any)._retained) return;

    const callId = event.toolCallId;

    // === Custom-context visibility check ===
    if (config.warnCustomContextVisibility) {
      const content = event.content as
        Array<{ type?: string; text?: string }> | undefined;
      const text = content?.find((c) => c.type === "text")?.text ?? "";
      if (text.length > config.modelVisibleMessageThresholdChars) {
        emitWarning({
          kind: "custom-context" as const,
          visibility: config.warningVisibility,
          toolName: event.toolName,
          callId,
          message: `Token hygiene: oversized model-visible ${event.toolName} result (${text.length} chars > ${config.modelVisibleMessageThresholdChars}). Review whether this should be smaller.`,
        });
      }
    }

    // === Read tracking ===
    if (event.toolName === "read" && config.warnDuplicateReads) {
      const input = event.input as Record<string, unknown> | undefined;
      const path = input?.path as string | undefined;
      const pathId = path ?? `read:${callId}`;

      const observation = {
        pathId,
        offset: input?.offset as number | undefined,
        limit: input?.limit as number | undefined,
        raw: undefined as boolean | undefined,
        turn: 0,
      } as Parameters<typeof tracker.recordRead>[0];

      const result = tracker.recordRead(observation);

      if (
        result.classification === "exact-repeat" &&
        !hasWarned("duplicate-read", pathId)
      ) {
        emitWarning({
          kind: "duplicate-read" as const,
          visibility: config.warningVisibility,
          toolName: "read",
          callId,
          message:
            "Token hygiene: exact duplicate read of this unchanged file range. Reuse existing context, or continue with a narrower offset/limit if needed.",
        });
      }

      // Large read warning
      if (config.warnLargeReads && observation.limit === undefined) {
        const content = event.content as
          Array<{ type?: string; text?: string }> | undefined;
        const text = content?.find((c) => c.type === "text")?.text ?? "";
        const lineCount = text.split("\n").length;
        const largeRead = evaluateLargeRead(
          lineCount,
          false,
          config.largeReadLineThreshold,
        );
        if (largeRead.isLarge && largeRead.warning) {
          emitWarning({
            kind: "large-read" as const,
            visibility: config.warningVisibility,
            toolName: "read",
            callId,
            message: largeRead.warning,
          });
        }
      }
    }

    // === Search tracking ===
    if (
      (event.toolName === "grep" ||
        event.toolName === "glob" ||
        event.toolName === "websearch" ||
        event.toolName === "webfetch") &&
      config.warnDuplicateReads
    ) {
      const input = event.input as Record<string, unknown> | undefined;
      let key = "";
      let pathScopeId: string | undefined;

      if (event.toolName === "grep" || event.toolName === "glob") {
        key = (input?.pattern as string) ?? (input?.path as string) ?? "";
        pathScopeId = input?.path as string | undefined;
      } else if (event.toolName === "websearch") {
        key = (input?.query as string) ?? "";
      } else if (event.toolName === "webfetch") {
        key = (input?.url as string) ?? "";
      }

      if (key) {
        const obsKey = `${event.toolName}:${key}`;
        if (!hasWarned("duplicate-search", obsKey)) {
          const searchInput = {
            tool: event.toolName as "grep" | "glob" | "websearch" | "webfetch",
            key: obsKey,
            pathScopeId,
            turn: 0,
          } as Parameters<typeof tracker.recordSearch>[0];
          const result = tracker.recordSearch(searchInput);

          if (result.classification === "repeated-search") {
            emitWarning({
              kind: "duplicate-search" as const,
              visibility: config.warningVisibility,
              toolName: event.toolName,
              callId,
              message: `Token hygiene: repeated ${event.toolName} with the same pattern. Reuse existing results or narrow the search scope.`,
            });
          }
        }
      }
    }
    // === Bash output compression (config.gate) ===
    if (event.toolName === "bash" && config.compressBashSuccesses) {
      const input = event.input as Record<string, unknown> | undefined;
      const command = typeof input?.command === "string" ? input.command : "";
      const isError = event.isError === true;
      const env: Record<string, string | undefined> = {};
      if (typeof process !== "undefined" && process.env) {
        for (const [k, v] of Object.entries(process.env)) {
          if (typeof v === "string" || typeof v === "undefined") {
            env[k] = v;
          }
        }
      }

      const text =
        (
          event.content as Array<{ type?: string; text?: string }> | undefined
        )?.find((c) => c.type === "text")?.text ?? "";

      const result = compressBashOutput({
        command,
        commandFamily: detectCompressorFamily(command),
        output: text,
        exitCode: isError ? 1 : 0,
        env,
        compressBashSuccesses: config.compressBashSuccesses,
        minCompressLines: config.minCompressLines,
        minCompressChars: config.minCompressChars,
        retainedOutputDir: ".pi/token-hygiene-retained",
        sessionStartMs: Date.now(),
        classifyOutput: classifySensitiveOutput,
      });

      if (result.kind === "summary") {
        // Replace the event content with the compressed summary
        // The opaque ID lets the user look up the full output later.
        const summaryBlock = `[compressed: ${result.decision.originalChars}->${result.decision.compressedChars} chars | full output retained as token-hygiene output ${result.retainedOutputId}]\n${result.summary}`;
        // Note: Pi's tool_result mutation depends on the API; we surface
        // the decision via the warnings array and a future context-report entry.
        emitWarning({
          kind: "custom-context" as const,
          visibility: "ui-only" as const,
          toolName: "bash",
          callId,
          message: `Token hygiene: compressed bash output (${result.decision.originalChars} -> ${result.decision.compressedChars} chars). Full output retained as ${result.retainedOutputId}. ${summaryBlock}`,
        });
        // Suppress unused-var lint
        void summaryBlock;
      }
    }
  });

  pi.on("agent_end", async () => {
    // Warnings are tracked; report builder uses them
  });

  pi.on("session_shutdown", async () => {
    sweepRetainedFiles(process.cwd());
  });

  // ── Thinking label strip ──
  pi.on("message_end", async (event) => {
    if (!config.enabled) return;
    // Only process assistant messages with content
    if (
      !event.message ||
      event.message.role !== "assistant" ||
      !Array.isArray(event.message.content)
    )
      return;

    const cleaned = cleanThinkingContent(event.message.content);
    if (cleaned) {
      event.message.content = cleaned;
    }
  });

  // Command registration
  pi.registerCommand("token-hygiene", {
    description: "Show token context report with reduction candidates.",
    handler: async (_args, ctx) => {
      if (!config.enabled) {
        await ctx.ui.notify("Token hygiene is disabled.", "info");
        return;
      }

      const report = buildTokenHygieneReport(
        {
          warnings,
          metricsAvailable: config.metricsEnabled,
          metricsPath: config.metricsPath,
          retentionDays: config.metricsRetentionDays,
        },
        config,
      );

      const rendered = renderTokenHygieneReport(report);
      await ctx.ui.confirm("Token Hygiene Report", rendered);
    },
  });

  // Expose internals for testing
  return {
    getConfig: () => config,
    getTracker: () => tracker,
    getWarnings: () => [...warnings],
  };
}
