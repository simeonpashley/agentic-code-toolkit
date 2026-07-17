import { describe, expect, it } from "vitest";
import {
  applySpans,
  buildHashlineFile,
  computeLineHash,
  resolveEditSpans,
} from "../extensions/pi-hashline-edit/src/hashline";
import { parseHashlineOldStr } from "../extensions/pi-hashline-edit/src/str-replace";

function readLine(lines: readonly string[], index: number): string {
  return `${index + 1}#x${computeLineHash(lines, index)}│${lines[index]}`;
}

describe("parseHashlineOldStr", () => {
  it("converts a contiguous read block into one replacement span", () => {
    const file = buildHashlineFile("alpha\nbeta\ngamma\ndelta\n");
    const oldStr = [readLine(file.lines, 1), readLine(file.lines, 2)].join(
      "\n",
    );

    const edit = parseHashlineOldStr(oldStr, "beta changed\ngamma changed");
    const result = resolveEditSpans(file, [edit]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spans).toHaveLength(1);
    expect(applySpans(file, result.spans).file.content).toBe(
      "alpha\nbeta changed\ngamma changed\ndelta\n",
    );
  });

  it("rejects a non-contiguous block instead of widening the replacement", () => {
    const file = buildHashlineFile("alpha\nbeta\ngamma\ndelta\n");
    const oldStr = [readLine(file.lines, 0), readLine(file.lines, 2)].join(
      "\n",
    );

    expect(() => parseHashlineOldStr(oldStr, "replacement")).toThrow(
      /contiguous/i,
    );
  });

  it("rejects raw source text without hashline prefixes", () => {
    expect(() => parseHashlineOldStr("beta", "replacement")).toThrow(
      /LINE#xHASH|hashline/i,
    );
  });

  it("preserves the pages source when inserting a new source directive", () => {
    const lines = [
      '@import "tailwindcss";',
      "@source '../components';",
      "@source '../layouts';",
      "@source '../pages';",
      "@plugin '@tailwindcss/typography';",
    ];
    const file = buildHashlineFile(`${lines.join("\n")}\n`);
    const pagesReadLine = readLine(file.lines, 3);

    expect(pagesReadLine).toContain("@source '../pages';");
  });
});
