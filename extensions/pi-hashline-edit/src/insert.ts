import { Text } from "@earendil-works/pi-tui";
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { constants } from "fs";
import { readFileSync } from "fs";
import {
  type HashlineEdit,
  type HashlineToolEdit,
  ANCHOR_SEP,
  buildHashlineFile,
  computeLineHash,
  HASH_PREFIX,
} from "./hashline";
import { resolveToCwd } from "./path-utils";
import { formatDiffResult } from "./edit-diff-render";
import { setReadSnapshot } from "./read-snapshot";
import { resolveEditTarget } from "./edit";
import { applyMutation } from "./mutation";
import { isRecord } from "./runtime";
import { checkStale, recordMtime } from "./stale-read";

export const insertToolSchema = Type.Object(
  {
    path: Type.String({
      description:
        "Relative or absolute path of the existing UTF-8 text file to modify.",
    }),
    insert_line: Type.String({
      description: `LINE${ANCHOR_SEP}${HASH_PREFIX}HASH anchor from read output (format: line number + #x + HASH + │ + content), or "0" to insert at the beginning of the file. Copy the anchor verbatim including the full prefix. The anchor line is preserved.`,
    }),
    insert_text: Type.String({
      description: "Raw text to insert without LINE#xHASH prefixes.",
    }),
  },
  { additionalProperties: false },
);

// ─── Types ──────────────────────────────────────────────────────────────

type InsertRequestParams = {
  path: string;
  insert_line: string;
  insert_text: string;
};

type InsertMetrics = {
  edits_attempted: number;
  edits_noop: number;
  warnings: number;
  classification: "applied" | "noop";
  added_lines?: number;
  removed_lines?: number;
};

type InsertToolDetails = {
  diff: string;
  warnings?: string[];
  snapshotId?: string;
  classification?: "noop";
  metrics?: InsertMetrics;
  package: { name: string; version: string };
};

const INSERT_DESC = readFileSync(
  new URL("../tool-descriptions/insert.md", import.meta.url),
  "utf-8",
).trim();

// ─── Normalization ──────────────────────────────────────────────────────

export function assertInsertRequest(
  request: unknown,
): asserts request is InsertRequestParams {
  if (!isRecord(request)) throw new Error("Insert request must be an object.");
  if (typeof request.path !== "string" || request.path.length === 0) {
    throw new Error('Insert request requires a non-empty "path" string.');
  }
  if (
    typeof request.insert_line !== "string" ||
    request.insert_line.length === 0
  ) {
    throw new Error(
      'Insert request requires an "insert_line" string ("0" for beginning of file, or a LINE#xHASH anchor).',
    );
  }
  if (typeof request.insert_text !== "string") {
    throw new Error('Insert request requires an "insert_text" string.');
  }
}

function normalizeInsertItems(
  request: InsertRequestParams,
): HashlineToolEdit[] {
  if (request.insert_line === "0") {
    return [{ op: "prepend", pos: "0", lines: request.insert_text }];
  }
  return [
    { op: "append", pos: request.insert_line, lines: request.insert_text },
  ];
}

// ─── Render ─────────────────────────────────────────────────────────────

type EditPreview = { diff: string } | { error: string };
type InsertRenderState = {
  argsKey?: string | undefined;
  preview?: EditPreview | undefined;
  previewGeneration?: number | undefined;
};

function getRenderablePreviewInput(args: unknown): InsertRequestParams | null {
  if (
    !isRecord(args) ||
    typeof args.path !== "string" ||
    typeof args.insert_line !== "string" ||
    typeof args.insert_text !== "string"
  ) {
    return null;
  }
  return {
    path: args.path,
    insert_line: args.insert_line,
    insert_text: args.insert_text,
  };
}

function formatInsertCall(
  args: InsertRequestParams | undefined,
  _state: InsertRenderState,
  theme: Pick<Theme, "bold" | "fg">,
): string {
  const path = args?.path;
  const pathDisplay =
    typeof path === "string" && path.length > 0
      ? theme.fg("accent", path)
      : theme.fg("toolOutput", "...");
  let text = `${theme.fg("toolTitle", theme.bold("insert"))} ${pathDisplay}`;

  return text;
}

export async function computeInsertPreview(
  request: unknown,
  cwd: string,
): Promise<EditPreview> {
  try {
    assertInsertRequest(request);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const params = request as InsertRequestParams;
  const path = params.path;
  const absolutePath = resolveToCwd(path, cwd);
  const toolEdits = normalizeInsertItems(params);

  const target = await resolveEditTarget(absolutePath, path, constants.R_OK);
  if (!target.ok) {
    return { error: target.error };
  }

  const lines: string[] = [];
  for (const edit of toolEdits) {
    const direction = edit.op === "prepend" ? "before" : "after";
    lines.push(`  insert ${direction} ${edit.pos}`);
  }

  return {
    diff: `Inserting ${toolEdits.length} block(s):\n${lines.join("\n")}`,
  };
}

// ─── Tool definition ────────────────────────────────────────────────────

type InsertToolDefinition = ToolDefinition<
  typeof insertToolSchema,
  InsertToolDetails,
  InsertRenderState
> & { renderShell?: "default" | "self" };

const insertToolDefinition: InsertToolDefinition = {
  name: "insert",
  label: "Insert",
  description: INSERT_DESC,
  parameters: insertToolSchema,
  promptSnippet:
    'Must read the file first. Use insert for ALL additive changes that preserve existing content — new imports, directives, list items, declarations, code blocks, or comments. Copy the insert_line anchor verbatim from read output including the #xHASH│ prefix. To insert at the beginning of the file, use insert_line: "0". The anchor line is always preserved. Use str_replace only for replacement or deletion.',
  renderShell: "default",
  renderCall(args, theme, context) {
    const previewInput = getRenderablePreviewInput(args);
    if (context.executionStarted) {
      context.state.argsKey = undefined;
      context.state.preview = undefined;
      context.state.previewGeneration =
        (context.state.previewGeneration ?? 0) + 1;
    } else if (!context.argsComplete || !previewInput) {
      context.state.argsKey = undefined;
      context.state.preview = undefined;
      context.state.previewGeneration =
        (context.state.previewGeneration ?? 0) + 1;
    } else {
      const argsKey = JSON.stringify(previewInput);
      if (context.state.argsKey !== argsKey) {
        context.state.argsKey = argsKey;
        context.state.preview = undefined;
        const previewGeneration = (context.state.previewGeneration ?? 0) + 1;
        context.state.previewGeneration = previewGeneration;
        computeInsertPreview(previewInput, context.cwd)
          .then((preview) => {
            if (
              context.state.argsKey === argsKey &&
              context.state.previewGeneration === previewGeneration
            ) {
              context.state.preview = preview;
              context.invalidate();
            }
          })
          .catch((err: unknown) => {
            if (
              context.state.argsKey === argsKey &&
              context.state.previewGeneration === previewGeneration
            ) {
              context.state.preview = {
                error: err instanceof Error ? err.message : String(err),
              };
              context.invalidate();
            }
          });
      }
    }
    const text =
      (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
    text.setText(
      formatInsertCall(
        getRenderablePreviewInput(args) ?? undefined,
        context.state as InsertRenderState,
        theme as {
          bold: (text: string) => string;
          fg: (token: string, text: string) => string;
        },
      ),
    );
    return text;
  },

  renderResult(result, { isPartial }, theme, context) {
    if (isPartial) {
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      text.setText(theme.fg("warning", "Inserting..."));
      return text;
    }

    const typedResult = result as {
      content?: Array<{ type: string; text?: string }>;
      details?: InsertToolDetails;
    };

    if (context.isError) {
      const textContent = typedResult.content?.find(
        (entry): entry is { type: "text"; text: string } =>
          entry.type === "text" && typeof entry.text === "string",
      );
      if (!textContent) return new Text("", 0, 0);
      const text =
        context.lastComponent instanceof Text
          ? context.lastComponent
          : new Text("", 0, 0);
      text.setText(`\n${theme.fg("error", textContent.text)}`);
      return text;
    }

    const details = typedResult.details;
    const metrics = details?.metrics;
    if (metrics?.classification === "applied" && details?.diff) {
      const maxLines = context.expanded ? Infinity : 16;
      const rendered = formatDiffResult(details.diff, maxLines, theme);

      const sections: string[] = [];
      if (rendered) sections.push(rendered);

      if (
        metrics.added_lines !== undefined ||
        metrics.removed_lines !== undefined
      ) {
        const parts: string[] = [];
        if (metrics.added_lines)
          parts.push(
            `${metrics.added_lines} insertion${metrics.added_lines !== 1 ? "s" : ""}(+)`,
          );
        if (metrics.removed_lines)
          parts.push(
            `${metrics.removed_lines} removal${metrics.removed_lines !== 1 ? "s" : ""}(-)`,
          );
        if (parts.length) sections.push(theme.fg("accent", parts.join(", ")));
      }
      if (details.warnings?.length) {
        sections.push(`Warnings:\n${details.warnings.join("\n")}`);
      }

      if (sections.length) {
        const text =
          context.lastComponent instanceof Text
            ? context.lastComponent
            : new Text("", 0, 0);
        text.setText(sections.join("\n\n"));
        return text;
      }
    }

    return new Text("", 0, 0);
  },

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    assertInsertRequest(params);

    const request = params as InsertRequestParams;
    const path = request.path;
    const absolutePath = resolveToCwd(path, ctx.cwd);
    const staleMsg = checkStale(absolutePath, path);
    if (staleMsg) {
      return {
        content: [{ type: "text" as const, text: staleMsg }],
        isError: true,
        details: { stale: true },
      };
    }

    let resolvedEdits: HashlineEdit[] | undefined;
    let toolEdits: HashlineToolEdit[];

    if (request.insert_line === "0") {
      const target = await resolveEditTarget(
        absolutePath,
        path,
        constants.R_OK | constants.W_OK,
      );
      if (!target.ok) throw new Error(target.error);
      const file = buildHashlineFile(target.normalized);
      if (file.lines.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Cannot insert at beginning of an empty file. Use the write tool to create initial content.",
            },
          ],
          isError: true,
          details: {},
        };
      }
      const line1Hash = computeLineHash(file.lines, 0);
      const pos = { line: 1, hash: line1Hash };
      resolvedEdits = [
        {
          op: "prepend",
          pos,
          expected: [pos],
          lines: request.insert_text.replaceAll("\r", "").split("\n"),
        },
      ];
      toolEdits = [];
    } else {
      toolEdits = normalizeInsertItems(request);
    }

    const result = await applyMutation({
      pi: _insertPi,
      path,
      absolutePath,
      toolEdits,
      ...(resolvedEdits ? { resolvedEdits } : {}),
      signal,
      ctx,
    });

    // Record mtime on success (mutation.ts also records, this is redundancy)
    if (!result.isError) {
      try {
        recordMtime(absolutePath);
      } catch {
        /* best-effort */
      }
    }
    return result;
  },
};

let _insertPi: ExtensionAPI | undefined;

export function registerInsertTool(pi: ExtensionAPI): void {
  _insertPi = pi;
  pi.events.on("hashline:read-snapshot", (data: unknown) => {
    if (data && typeof data === "object" && "path" in data && "file" in data) {
      setReadSnapshot(
        (data as { path: string; file: import("./hashline").HashlineFile })
          .path,
        (data as { path: string; file: import("./hashline").HashlineFile })
          .file,
      );
    }
  });
  pi.registerTool(insertToolDefinition);
}
