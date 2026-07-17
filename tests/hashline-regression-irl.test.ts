import { describe, expect, it } from "vitest";
import {
  applySpans,
  buildHashlineFile,
  computeLineHash,
  resolveEditSpans,
} from "../extensions/pi-hashline-edit/src/hashline";
import { parseHashlineOldStr } from "../extensions/pi-hashline-edit/src/str-replace";

// Fixture: the tailwind.css as it stood before the erroneous edit.
// Reconstructed from session log reads at ~07:16:24.
const TAILWIND_CSS =
  [
    '@import "tailwindcss";',
    "@source '../components';",
    "@source '../layouts';",
    "@source '../pages';",
    "@plugin '@tailwindcss/typography';",
    "@theme {",
    "  --breakpoint-us: 23.4375rem;",
    "  --breakpoint-xs: 25.6875rem;",
    "  --breakpoint-sm: 40rem;",
    "  --breakpoint-md: 48rem;",
    "  --breakpoint-lg: 64rem;",
    "  --breakpoint-xl: 80rem;",
    "  --breakpoint-2xl: 96rem;",
    "}",
  ].join("\n") + "\n";

function readLine(lines: readonly string[], index: number): string {
  return `${index + 1}#x${computeLineHash(lines, index)}│${lines[index]}`;
}

describe("IRL regression: @source pages accidentally replaced", () => {
  it("replacing @source '../pages' with an inline source loses the pages declaration", () => {
    const file = buildHashlineFile(TAILWIND_CSS);
    const pagesLine = readLine(file.lines, 3);

    const edit = parseHashlineOldStr(
      pagesLine,
      "@source inline('md:flex lg:flex-row');",
    );
    const result = resolveEditSpans(file, [edit]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = applySpans(file, result.spans);
    expect(applied.file.content).not.toContain("@source '../pages';");
    expect(applied.file.content).toContain(
      "@source inline('md:flex lg:flex-row');",
    );
  });

  it("inserting after @source '../pages' preserves the pages declaration", () => {
    const file = buildHashlineFile(TAILWIND_CSS);
    const insertEdit = {
      op: "append" as const,
      pos: { line: 4, hash: computeLineHash(file.lines, 3) },
      lines: ["@source inline('md:flex lg:flex-row');"],
    };

    const result = resolveEditSpans(file, [insertEdit]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = applySpans(file, result.spans);
    expect(applied.file.content).toContain("@source '../pages';");
    expect(applied.file.content).toContain(
      "@source inline('md:flex lg:flex-row');",
    );
    const lines = applied.file.content.split("\n");
    const pagesIdx = lines.findIndex((l) => l === "@source '../pages';");
    const inlineIdx = lines.findIndex((l) => l.startsWith("@source inline("));
    expect(inlineIdx).toBe(pagesIdx + 1);
  });

  it("str_replace on a single line genuinely replaces it, everything else intact", () => {
    const file = buildHashlineFile(TAILWIND_CSS);
    const importLine = readLine(file.lines, 0);

    const edit = parseHashlineOldStr(importLine, "@import 'tailwindcss/v4';");
    const result = resolveEditSpans(file, [edit]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = applySpans(file, result.spans);
    expect(applied.file.content).toContain("@import 'tailwindcss/v4';");
    expect(applied.file.content).toContain("@source '../components';");
    expect(applied.file.content).toContain("@source '../layouts';");
    expect(applied.file.content).toContain("@source '../pages';");
  });

  it("str_replace rejects non-contiguous old_str", () => {
    const file = buildHashlineFile(TAILWIND_CSS);
    expect(() =>
      parseHashlineOldStr(
        [readLine(file.lines, 0), readLine(file.lines, 3)].join("\n"),
        "replacement",
      ),
    ).toThrow(/contiguous/i);
  });
});

describe("IRL regression: one-line expansion should be insert", () => {
  it("adding custom variants after @plugin uses insert, not replace", () => {
    const file = buildHashlineFile(TAILWIND_CSS);
    const pluginHash = computeLineHash(file.lines, 4);

    const insertEdit = {
      op: "append" as const,
      pos: { line: 5, hash: pluginHash },
      lines: [
        "@custom-variant sm (@media (width >= 40rem));",
        "@custom-variant md (@media (width >= 48rem));",
      ],
    };

    const result = resolveEditSpans(file, [insertEdit]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = applySpans(file, result.spans);
    expect(applied.file.content).toContain(
      "@plugin '@tailwindcss/typography';",
    );
    expect(applied.file.content).toContain("@custom-variant sm");
  });

  it("adding standard breakpoints after xs uses insert, not replace", () => {
    const file = buildHashlineFile(TAILWIND_CSS);
    const xsHash = computeLineHash(file.lines, 7);

    const insertEdit = {
      op: "append" as const,
      pos: { line: 8, hash: xsHash },
      lines: [
        "  --breakpoint-sm: 40rem;",
        "  --breakpoint-md: 48rem;",
        "  --breakpoint-lg: 64rem;",
        "  --breakpoint-xl: 80rem;",
        "  --breakpoint-2xl: 96rem;",
      ],
    };

    const result = resolveEditSpans(file, [insertEdit]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = applySpans(file, result.spans);
    expect(applied.file.content).toContain("--breakpoint-xs: 25.6875rem;");
    expect(applied.file.content).toContain("--breakpoint-sm: 40rem;");
    expect(applied.file.content).toContain("--breakpoint-2xl: 96rem;");
  });
});

describe("IRL regression: tool selection — replace destroys, insert preserves", () => {
  it("str_replace destroys its anchor range; insert keeps it", () => {
    const file = buildHashlineFile(TAILWIND_CSS);
    const pagesLine = readLine(file.lines, 3);

    const replaceEdit = parseHashlineOldStr(
      pagesLine,
      "@source inline('md:flex lg:flex-row');",
    );
    const replaceResult = resolveEditSpans(file, [replaceEdit]);
    expect(replaceResult.ok).toBe(true);
    if (!replaceResult.ok) return;
    const replaced = applySpans(file, replaceResult.spans);
    expect(replaced.file.content).not.toContain("@source '../pages';");

    const insertEdit = {
      op: "append" as const,
      pos: { line: 4, hash: computeLineHash(file.lines, 3) },
      lines: ["@source inline('md:flex lg:flex-row');"],
    };
    const insertResult = resolveEditSpans(file, [insertEdit]);
    expect(insertResult.ok).toBe(true);
    if (!insertResult.ok) return;
    const inserted = applySpans(file, insertResult.spans);
    expect(inserted.file.content).toContain("@source '../pages';");
    expect(inserted.file.content).toContain(
      "@source inline('md:flex lg:flex-row');",
    );
  });
});
