import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync } from "fs";
import {
  parseHashlineReadBlock,
  type HashlineEdit,
  CONTENT_SEP,
  buildHashlineFile,
  computeLineHash,
} from "./hashline";
import { resolveToCwd } from "./path-utils";
import { readFile } from "fs/promises";
import { applyMutation } from "./mutation";
import { checkStale, recordMtime } from "./stale-read";

const strReplaceSchema = Type.Object(
  {
    path: Type.String({
      description:
        "Relative or absolute path of the existing UTF-8 text file to modify.",
    }),
    old_str: Type.String({
      minLength: 1,
      description:
        "One or more contiguous LINE#xHASH│content lines copied verbatim from the latest read output. The format is: line number + #x + HASH + │ + actual content. Copy everything after │ — preserve exact indentation. Never include the line-number prefix in new_str.",
    }),
    new_str: Type.String({
      description:
        "Raw replacement text without LINE#xHASH prefixes. Use an empty string to delete the selected content.",
    }),
  },
  { additionalProperties: false },
);

type StrReplaceParams = {
  path: string;
  old_str: string;
  new_str: string;
};

const STR_REPLACE_DESCRIPTION = readFileSync(
  new URL("../tool-descriptions/str-replace.md", import.meta.url),
  "utf-8",
).trim();

export function parseHashlineOldStr(
  oldStr: string,
  newStr: string,
): HashlineEdit {
  const expected = parseHashlineReadBlock(oldStr);
  const lines = newStr === "" ? [] : newStr.replaceAll("\r", "").split("\n");
  return {
    op: "replace",
    pos: expected[0]!,
    end: expected.at(-1)!,
    expected,
    lines,
  };
}

/**
 * Handle a plain-text old_str (no hashline prefix) by exact-string matching.
 * 0 matches -> steer toward hashline format
 * 2+ matches -> steer toward hashline format to disambiguate
 * 1 match   -> apply via shared mutation engine
 */
export async function handlePlainTextStrReplace(
  request: StrReplaceParams,
  absolutePath: string,
  ctx: ExtensionContext,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const content = await readFile(absolutePath, "utf-8");
  recordMtime(absolutePath);
  const idx = content.indexOf(request.old_str);

  if (idx === -1) {
    return {
      content: [
        {
          type: "text" as const,
          text: `[E_NO_MATCH] No match found for old_str in ${request.path}. Read the file with the read tool, then use hashline-prefixed lines from its output — they look like "12#x3FF│const x=1;".`,
        },
      ],
      isError: true,
      details: {},
    } as unknown as AgentToolResult<Record<string, unknown>>;
  }

  const secondIdx = content.indexOf(request.old_str, idx + 1);
  if (secondIdx !== -1) {
    return {
      content: [
        {
          type: "text" as const,
          text: `[E_MULTI_MATCH] Multiple matches for old_str in ${request.path}. Use a hashline-prefixed block from read output to uniquely identify the target — copy LINE#xHASH│content lines from the latest read.`,
        },
      ],
      isError: true,
      details: {},
    } as unknown as AgentToolResult<Record<string, unknown>>;
  }

  // Single match — compute line range and build hashline edit
  const file = buildHashlineFile(content);
  const beforeMatch = content.slice(0, idx);
  const startLine = beforeMatch.split("\n").length;
  const oldStrLines = request.old_str.replaceAll("\r", "").split("\n");
  const endLine = startLine + oldStrLines.length - 1;

  const expected: Array<{ line: number; hash: string }> = [];
  for (let i = startLine; i <= endLine; i++) {
    expected.push({ line: i, hash: computeLineHash(file.lines, i - 1) });
  }

  const edit: HashlineEdit = {
    op: "replace",
    pos: expected[0]!,
    end: expected.at(-1)!,
    expected,
    lines:
      request.new_str === ""
        ? []
        : request.new_str.replaceAll("\r", "").split("\n"),
  };

  const result = await applyMutation({
    pi: undefined,
    path: request.path,
    absolutePath,
    toolEdits: [],
    resolvedEdits: [edit],
    signal: undefined,
    ctx,
  });
  if (!result.isError) recordMtime(absolutePath);
  return result as unknown as AgentToolResult<Record<string, unknown>>;
}

export function assertStrReplaceParams(
  params: unknown,
): asserts params is StrReplaceParams {
  if (!params || typeof params !== "object") {
    throw new Error("str_replace request must be an object.");
  }
  const request = params as Record<string, unknown>;
  if (typeof request.path !== "string" || request.path.length === 0) {
    throw new Error('str_replace requires a non-empty "path" string.');
  }
  if (typeof request.old_str !== "string" || request.old_str.length === 0) {
    throw new Error('str_replace requires a non-empty "old_str" string.');
  }
  if (typeof request.new_str !== "string") {
    throw new Error('str_replace requires a "new_str" string.');
  }
}

let piForStrReplace: ExtensionAPI | undefined;

const strReplaceToolDefinition: ToolDefinition<typeof strReplaceSchema> = {
  name: "str_replace",
  label: "Str Replace",
  description: STR_REPLACE_DESCRIPTION,
  parameters: strReplaceSchema,
  promptSnippet:
    "Must read the file first — mutations require a prior read. Use str_replace only to replace or delete the exact hashline block in old_str — copy it verbatim from read output including the LINE#xHASH│ prefix on every line. Use insert for additive changes that preserve existing lines. Example old_str: '12#xF41│const x=1;'",
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    assertStrReplaceParams(params);
    const request = params as StrReplaceParams;
    const absolutePath = resolveToCwd(request.path, ctx.cwd);
    const staleMsg = checkStale(absolutePath, request.path);
    if (staleMsg) {
      return {
        content: [{ type: "text" as const, text: staleMsg }],
        isError: true,
        details: { stale: true },
      } as unknown as AgentToolResult<Record<string, unknown>>;
    }
    // Plain-text old_str: use exact-string match fallback
    if (!request.old_str.includes(CONTENT_SEP)) {
      return await handlePlainTextStrReplace(request, absolutePath, ctx);
    }
    const parsed = parseHashlineOldStr(request.old_str, request.new_str);
    const result = await applyMutation({
      pi: piForStrReplace,
      path: request.path,
      absolutePath,
      toolEdits: [],
      resolvedEdits: [parsed],
      signal,
      ctx,
    });
    if (!result.isError) recordMtime(absolutePath);
    return result as unknown as AgentToolResult<Record<string, unknown>>;
  },
};

export function registerStrReplaceTool(pi: ExtensionAPI): void {
  piForStrReplace = pi;
  pi.registerTool(strReplaceToolDefinition);
}
