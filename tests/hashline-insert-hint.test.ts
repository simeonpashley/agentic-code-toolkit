import { describe, it, expect } from "vitest";
import {
  buildHashlineFile,
  computeLineHash,
  resolveEditAnchors,
  resolveEditSpans,
  type HashlineToolEdit,
} from "../extensions/pi-hashline-edit/src/hashline";

function edit(pos: string, end: string, lines: string[]): HashlineToolEdit {
  return { op: "replace", pos, end, lines };
}

function make(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

describe("single-line replace with multi-line content → insert hint", () => {
  // RED: resolveEditSpans does NOT emit any warning for this pattern.
  // EXPECTED: A warning suggesting `insert` should be present when the
  // agent replaces a single line with N>1 lines and the anchor line is
  // NOT preserved in the replacement.
  it("warns about insert when replacing one line with multiple and anchor line is not preserved", () => {
    const content = make(
      "---",
      'title: "Hello"',
      "home_preview: 'old description'",
      "---",
    );
    const file = buildHashlineFile(content);

    // Agent replaces line 3 (home_preview) with a new channels block
    const pos = `3#x${computeLineHash(file.lines, 2)}`;
    const end = `3#x${computeLineHash(file.lines, 2)}`;
    const replacement = [
      "channels:",
      "  bluesky:",
      '    body: "...",',
      '    visible_at: "3026-01-01"',
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should have a warning suggesting `insert`
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(
      result.warnings.some(
        (w) =>
          /insert/i.test(w) ||
          /additive/i.test(w) ||
          /preserves the anchor/i.test(w),
      ),
    ).toBe(true);
  });

  it("does NOT warn when replacing one line with one line (genuine single-line edit)", () => {
    const content = make("line 1", "line 2", "line 3");
    const file = buildHashlineFile(content);

    const pos = `2#x${computeLineHash(file.lines, 1)}`;
    const end = `2#x${computeLineHash(file.lines, 1)}`;
    // One line replaced with one different line — genuine edit
    const replacement = ["line 2 changed"];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const insertHints = result.warnings.filter(
      (w) => /insert/i.test(w) || /additive/i.test(w),
    );
    expect(insertHints.length).toBe(0);
  });

  it("does NOT warn for multi-line range (genuine range edit)", () => {
    const content = make("---", "alpha", "beta", "gamma", "---");
    const file = buildHashlineFile(content);

    // Replace lines 2-4 with 2 lines — genuine multi-line range edit
    const pos = `2#x${computeLineHash(file.lines, 1)}`;
    const end = `4#x${computeLineHash(file.lines, 3)}`;
    const replacement = ["delta", "epsilon"];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const insertHints = result.warnings.filter(
      (w) => /insert/i.test(w) || /additive/i.test(w),
    );
    expect(insertHints.length).toBe(0);
  });

  it("does NOT warn when anchor line IS preserved (lines[0] matches original)", () => {
    const content = make("---", 'title: "Hello"', "home_preview: 'old'", "---");
    const file = buildHashlineFile(content);

    // Agent replaces line 3 with same line + new content — wants to keep it
    const pos = `3#x${computeLineHash(file.lines, 2)}`;
    const end = `3#x${computeLineHash(file.lines, 2)}`;
    const replacement = [
      "home_preview: 'old'", // ← preserved
      "channels:",
      "  bluesky:",
      '    body: "..."',
      '    visible_at: "3026-01-01"',
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const insertHints = result.warnings.filter(
      (w) => /insert/i.test(w) || /additive/i.test(w),
    );
    // Agent IS preserving the anchor — no insert hint needed
    expect(insertHints.length).toBe(0);
  });
});
