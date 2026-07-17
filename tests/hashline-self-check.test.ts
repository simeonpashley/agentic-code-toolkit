import { describe, it, expect } from "vitest";
import registerHashlineTools, {
  isHashlineEditActive,
} from "../extensions/pi-hashline-edit/index.ts";

// A representative hashline edit description. The real description is loaded
// from tool-descriptions/edit.md at runtime; this constant captures the
// shape the self-check depends on (must contain HASHLINE_EDIT_MARKER).
const HASHLINE_EDIT_DESCRIPTION =
  "Replace ranges in one UTF-8 text file using LINE#xHASH anchors copied verbatim from the latest `read` output.";

const BUILTIN_EDIT_DESCRIPTION =
  "Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file.";

describe("isHashlineEditActive", () => {
  it("returns true when the edit tool description contains the hashline marker", () => {
    const tools = [{ name: "edit", description: HASHLINE_EDIT_DESCRIPTION }];
    expect(isHashlineEditActive(tools)).toBe(true);
  });

  it("returns false when the edit tool description is the built-in exact-text edit", () => {
    const tools = [{ name: "edit", description: BUILTIN_EDIT_DESCRIPTION }];
    expect(isHashlineEditActive(tools)).toBe(false);
  });

  it("returns false when the edit tool is missing from the registry", () => {
    const tools: Array<{ name: string; description: string }> = [];
    expect(isHashlineEditActive(tools)).toBe(false);
  });

  it("returns false when only other tools are present", () => {
    const tools = [
      { name: "read", description: "Read a file" },
      { name: "bash", description: "Run a command" },
    ];
    expect(isHashlineEditActive(tools)).toBe(false);
  });

  it("handles descriptions that contain the marker mid-string", () => {
    const tools = [
      {
        name: "edit",
        description: `Some prefix. ${HASHLINE_EDIT_DESCRIPTION} Some suffix.`,
      },
    ];
    expect(isHashlineEditActive(tools)).toBe(true);
  });

  it("returns true for an empty tool list when no edit is registered", () => {
    // Defensive: an empty list has no edit tool, so the override cannot
    // have taken. Verifies the "no tool" branch is reachable from a real
    // call shape (empty array, not just missing key).
    expect(isHashlineEditActive([])).toBe(false);
  });
});

describe("hashline tool registration", () => {
  it("registers the lossless insert and explicit str_replace tools", () => {
    const tools: Array<{ name: string }> = [];
    registerHashlineTools({
      registerTool: (tool: { name: string }) => tools.push(tool),
      events: { on: () => undefined },
      on: () => undefined,
    } as any);

    expect(tools.map((tool) => tool.name)).toEqual([
      "edit",
      "read",
      "str_replace",
      "insert",
    ]);
  });
});
