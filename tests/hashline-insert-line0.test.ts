import { describe, expect, it } from "vitest";
import {
  applySpans,
  buildHashlineFile,
  computeLineHash,
  resolveEditSpans,
} from "../extensions/pi-hashline-edit/src/hashline";

describe("insert at beginning of file (insert_line = 0)", () => {
  it("prepends content before line 1 via a prepend edit", () => {
    const file = buildHashlineFile("alpha\nbeta\n");
    const line1Hash = computeLineHash(file.lines, 0);
    const pos = { line: 1, hash: line1Hash };

    const edit = {
      op: "prepend" as const,
      pos,
      expected: [pos],
      lines: ["zero"],
    };

    const result = resolveEditSpans(file, [edit]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = applySpans(file, result.spans);
    expect(applied.file.content).toBe("zero\nalpha\nbeta\n");
  });

  it("does not touch the anchor line", () => {
    const file = buildHashlineFile("first\nsecond\n");
    const line1Hash = computeLineHash(file.lines, 0);
    const pos = { line: 1, hash: line1Hash };

    const edit = {
      op: "prepend" as const,
      pos,
      expected: [pos],
      lines: ["before"],
    };

    const result = resolveEditSpans(file, [edit]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = applySpans(file, result.spans);
    expect(applied.file.content).toContain("\nfirst\n");
  });
});
