/**
 * pi-hashline-edit — hashline-anchored `read` + `edit` toolchain.
 *
 * Goal: mitigate incorrect edits by requiring the LLM to reference lines
 * by their `LINE#HASH` anchor (e.g. `42#A4`). The hash covers the line
 * and its neighbours, so the edit tool refuses to apply if the file has
 * shifted beneath the model (a hash mismatch means the anchor is stale).
 *
 * `read` produces hashline-prefixed output; `edit` verifies anchors before
 * applying. Both are registered as replacements for the built-in tools.
 *
 * Per https://pi.dev/docs/latest/extensions (Overriding Built-in Tools),
 * registering a tool with the same name as a built-in replaces it in the
 * registry. Interactive mode logs a warning when this happens.
 *
 * This extension verifies the override on every session_start and emits a
 * warning notification if the hashline edit tool is not the active `edit`.
 * That makes silent override failures (extension not loaded, factory error,
 * name conflict) visible to the user instead of letting the LLM fall back
 * to the built-in exact-text edit and produce unexpected `oldText` errors.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerEditTool } from "./src/edit";
import { registerInsertTool } from "./src/insert";
import { registerReadTool } from "./src/read";
import { registerStrReplaceTool } from "./src/str-replace";

// A substring unique to this extension's edit tool description. Used to
// distinguish the hashline edit from the built-in exact-text edit when
// inspecting the active tool registry. If the wording in
// tool-descriptions/edit.md changes, update this marker accordingly.
//
// The description renders `LINE#xHASH` in backticks, so the substring
// `LINE#xHASH anchors` would NOT match (backtick sits between HASH and
// "anchors"). We use "using LINE#xHASH anchors" which straddles the
// backtick boundary and is unambiguous.
// The `x` prefix is mandatory in the anchor syntax (e.g. "31#xA4F").
const HASHLINE_EDIT_MARKER = "using LINE#xHASH anchors";

/**
 * Pure check: is the active `edit` tool the hashline variant?
 *
 * Exported for unit testing. Production callers should rely on the
 * session_start self-check in the default export below.
 */
export function isHashlineEditActive(
  tools: ReadonlyArray<{ name: string; description: string }>,
): boolean {
  const editTool = tools.find((t) => t.name === "edit");
  if (!editTool) return false;
  return editTool.description.includes(HASHLINE_EDIT_MARKER);
}

export default function (pi: ExtensionAPI): void {
  registerEditTool(pi);
  registerReadTool(pi);
  registerStrReplaceTool(pi);
  registerInsertTool(pi);

  // Unconditional load notification. Previously gated on PI_HASHLINE_DEBUG=1,
  // which made "is the extension actually loaded?" unanswerable without an
  // undocumented env var. The notification is a single line so it does not
  // interrupt the session_start UX.
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("pi-hashline-edit: loaded", "info");

    // Self-check: confirm the edit override took. If the hashline edit is
    // not the active `edit` tool, warn the user. The most common cause is
    // a factory error that prevented the tool from being registered, in
    // which case the LLM will silently fall back to the built-in exact-text
    // edit and produce confusing `oldText` errors.
    const tools = pi.getAllTools();
    if (!isHashlineEditActive(tools)) {
      ctx.ui.notify(
        "pi-hashline-edit: edit tool override did not take effect. The built-in exact-text edit is still active. Check for extension load errors and conflicts.",
        "warning",
      );
    }
  });
}
