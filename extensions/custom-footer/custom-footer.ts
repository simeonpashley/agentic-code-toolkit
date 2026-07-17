import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  buildPathString,
  fmtTokens,
  renderCacheUsage,
  renderContextUsage,
  renderModelInfo,
  renderPath,
  type ThemeFg,
} from "./renderers";

function isAssistantMessage(message: unknown): message is AssistantMessage {
  if (!message || typeof message !== "object") return false;
  const role = (message as { role?: unknown }).role;
  return role === "assistant";
}

/**
 * Strip control characters and repeated whitespace from status text before rendering.
 */
function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

// Extract dirty/clean indicator from git status text
function extractDirtyClean(gitStatus: string): string {
  const match = gitStatus.match(/(💩|✨)\s*(dirty|clean)/);
  return match ? `${match[1]} ${match[2]}` : "";
}

export default function (pi: ExtensionAPI) {
  let cacheInput = 0;
  let cacheRead = 0;

  // Track cache usage from agent_end
  pi.on("agent_end", (event: { messages: unknown[] }) => {
    cacheInput = 0;
    cacheRead = 0;
    for (const message of event.messages) {
      if (!isAssistantMessage(message)) continue;
      cacheInput += message.usage.input || 0;
      cacheRead += message.usage.cacheRead || 0;
    }
  });

  pi.on("session_start", async (_event: any, ctx: any) => {
    ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsubscribe,
        invalidate() {},
        render(width: number): string[] {
          const lines: string[] = [];

          // Line 1: operational - path, branch, dirty/clean
          const gitBranch = footerData.getGitBranch();
          const gitStatus = footerData.getExtensionStatuses().get("git") || "";
          const dirtyClean = extractDirtyClean(gitStatus);
          lines.push(renderLine1(width, theme, ctx, gitBranch, dirtyClean));

          // Line 2: model info - model • think, price hint, context, cache
          const extensionStatuses = footerData.getExtensionStatuses();
          const entries = Array.from(extensionStatuses.entries()) as Array<
            [string, string]
          >;
          const nonGitStatuses: string[] = entries
            .filter((entry) => entry[0] !== "git")
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map((entry) => sanitizeStatusText(entry[1]));

          lines.push(renderLine2(width, theme, ctx, nonGitStatuses));

          return lines;
        },
      };
    });
  });

  // ── Line 1: Path │ Branch │ Dirty/Clean ─────────────────────────

  function renderLine1(
    width: number,
    theme: ThemeFg,
    ctx: { cwd: string },
    gitBranch: string | null,
    dirtyClean: string,
  ): string {
    const sep = theme.fg("dim", " │ ");

    // Path + branch + dirty/clean
    const pathRaw = buildPathString(ctx.cwd, gitBranch);
    const pathDisplay = renderPath(pathRaw, width, theme);
    const dirty = dirtyClean ? theme.fg("warning", dirtyClean) : "";

    const segments: string[] = [];
    if (pathDisplay) segments.push(pathDisplay);
    if (dirty) segments.push(dirty);

    return truncateToWidth(segments.join(sep), width);
  }

  // ── Line 2: Model │ Extensions │ Context │ Cache ─────────────────

  function renderLine2(
    width: number,
    theme: ThemeFg,
    ctx: {
      getContextUsage():
        { percent: number | null; contextWindow: number } | null | undefined;
      model:
        | { provider?: string; id?: string; contextWindow?: number }
        | null
        | undefined;
    },
    extensionStatuses: string[],
  ): string {
    const sep = theme.fg("dim", " │ ");
    const sepW = 3;

    // Model + thinking
    const provider = ctx.model?.provider || "unknown";
    const modelName = ctx.model?.id || "no-model";
    const thinking = pi.getThinkingLevel();
    const modelInfo = renderModelInfo(modelName, provider, thinking, theme);

    // Extension statuses (price hints, etc.)
    const extLine =
      extensionStatuses.length > 0 ? extensionStatuses.join(" ") : "";
    const extW = visibleWidth(extLine);

    // Context usage
    const usage = ctx.getContextUsage();
    const pct = usage?.percent ?? 0;
    const win = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
    const ctxRaw = `${pct.toFixed(0)}%/${fmtTokens(win)}`;
    const ctxColored = renderContextUsage(pct, win, theme);

    // Cache usage
    const cacheColored = renderCacheUsage(cacheInput, cacheRead, theme);
    const cacheRaw = cacheColored ? visibleWidth(cacheColored) : 0;

    // Layout: model takes what's left after other segments
    const rightBlockWidth =
      (extW > 0 ? extW + sepW : 0) +
      sepW +
      visibleWidth(ctxRaw) +
      (cacheRaw > 0 ? sepW + cacheRaw : 0) +
      sepW +
      modelInfo.rawWidth;
    const modelBudget = width - rightBlockWidth - sepW;

    // Assemble from right to left
    const segments: string[] = [];
    if (modelBudget > 20) {
      const modelText =
        modelBudget < visibleWidth(modelInfo.text)
          ? modelInfo.text.slice(0, modelBudget - 1) + "…"
          : modelInfo.text;
      segments.push(modelText);
    }
    segments.push(ctxColored);
    if (cacheColored) segments.push(cacheColored);
    if (extLine) segments.push(theme.fg("muted", extLine));

    return truncateToWidth(segments.join(sep), width);
  }
}
