import { describe, it, expect } from "vitest";
import {
  buildHashlineFile,
  computeLineHash,
  resolveEditAnchors,
  type HashlineToolEdit,
} from "../extensions/pi-hashline-edit/src/hashline";
import {
  partitionExact,
  fuzzyMatch,
  computeFuzzyOffsetWindow,
} from "../extensions/pi-hashline-edit/src/fuzzy-match";

function edit(pos: string, end: string, lines: string[]): HashlineToolEdit {
  return { op: "replace", pos, end, lines };
}

function make(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

describe("computeFuzzyOffsetWindow", () => {
  it("scales with sqrt(fileSize) so small files stay tight", () => {
    // 100 lines → ceil(sqrt(100)/2) = 5
    expect(computeFuzzyOffsetWindow(100, "single")).toBe(5);
    expect(computeFuzzyOffsetWindow(100, "range")).toBe(5);
  });

  it("scales up for larger files", () => {
    // 400 lines → ceil(sqrt(400)/2) = 10
    expect(computeFuzzyOffsetWindow(400, "single")).toBe(10);
    expect(computeFuzzyOffsetWindow(400, "range")).toBe(10);
  });

  it("caps the window for very large files", () => {
    const w = computeFuzzyOffsetWindow(100_000, "single");
    expect(w).toBeLessThanOrEqual(50);
    expect(w).toBeGreaterThanOrEqual(10);
  });

  it("small-file window is at least 1 (legacy floor for single edits)", () => {
    // For tiny files the function returns the same window for single/range;
    // the per-edit floor (1 for single, 2 for range) is applied inside
    // fuzzyMatch. Test the public contract here:
    expect(computeFuzzyOffsetWindow(4, "single")).toBeGreaterThanOrEqual(1);
    expect(computeFuzzyOffsetWindow(4, "range")).toBeGreaterThanOrEqual(1);
  });

  it("returns the same window for single and range edits (intentional)", () => {
    // Both pos and end anchors shift together by the same offset when file
    // content is inserted or deleted above the target. Using separate windows
    // for single vs range would add asymmetry that doesn't match the real
    // drift pattern — if one anchor is 5 lines off, the other is also 5 lines
    // off in the same direction. A unified window avoids false rejections.
    // The `kind` parameter is kept in the signature for callers that don't
    // want to special-case; it may diverge if a future drift pattern justifies it.
    for (const n of [50, 200, 1500]) {
      expect(computeFuzzyOffsetWindow(n, "single")).toBe(
        computeFuzzyOffsetWindow(n, "range"),
      );
    }
  });
});

describe("fuzzyMatch — dynamic offset window", () => {
  it("relocates a single anchor that drifted by 5 lines (legacy would miss)", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    const inserted = Array.from({ length: 5 }, (_, i) => `INSERTED_${i}`);
    const base = make(...lines);
    const modified = make(...inserted, ...lines);

    const baseFile = buildHashlineFile(base);
    const currentFile = buildHashlineFile(modified);
    expect(currentFile.lines.length).toBe(105);

    const targetHash = computeLineHash(baseFile.lines, 49);
    const resolved = resolveEditAnchors([
      edit(`50#x${targetHash}`, `50#x${targetHash}`, ["changed line 50"]),
    ]);

    const exact = partitionExact(resolved, currentFile);
    expect(exact.unmatched.length).toBe(1);

    const fuzzy = fuzzyMatch(exact.unmatched, currentFile);
    expect(fuzzy.matched.length).toBe(1);
    if (fuzzy.matched.length > 0) {
      const m = fuzzy.matched[0]!;
      expect(m.pos.line).toBe(55);
    }
  });

  it("refuses to relocate when drift exceeds the window", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    const inserted = Array.from({ length: 50 }, (_, i) => `INSERTED_${i}`);
    const base = make(...lines);
    const modified = make(...inserted, ...lines);

    const baseFile = buildHashlineFile(base);
    const currentFile = buildHashlineFile(modified);

    const targetHash = computeLineHash(baseFile.lines, 49);
    const resolved = resolveEditAnchors([
      edit(`50#x${targetHash}`, `50#x${targetHash}`, ["changed line 50"]),
    ]);

    const exact = partitionExact(resolved, currentFile);
    const fuzzy = fuzzyMatch(exact.unmatched, currentFile);
    expect(fuzzy.matched.length).toBe(0);
  });

  it("still relocates a 2-line drift for a small file", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const inserted = ["INSERTED_0", "INSERTED_1"];
    const base = make(...lines);
    const modified = make(...inserted, ...lines);

    const baseFile = buildHashlineFile(base);
    const currentFile = buildHashlineFile(modified);

    const targetHash = computeLineHash(baseFile.lines, 4);
    const resolved = resolveEditAnchors([
      edit(`5#x${targetHash}`, `5#x${targetHash}`, ["changed line 5"]),
    ]);

    const exact = partitionExact(resolved, currentFile);
    const fuzzy = fuzzyMatch(exact.unmatched, currentFile);
    expect(fuzzy.matched.length).toBe(1);
  });

  it("relocates a range within window when both endpoints fit", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    const inserted = ["INS1", "INS2", "INS3"];
    const base = make(...lines);
    const modified = make(...inserted, ...lines);

    const baseFile = buildHashlineFile(base);
    const currentFile = buildHashlineFile(modified);

    const aHash = computeLineHash(baseFile.lines, 19);
    const bHash = computeLineHash(baseFile.lines, 24);
    const resolved = resolveEditAnchors([
      edit(`20#x${aHash}`, `25#x${bHash}`, ["L1", "L2", "L3", "L4"]),
    ]);

    const exact = partitionExact(resolved, currentFile);
    const fuzzy = fuzzyMatch(exact.unmatched, currentFile);
    expect(fuzzy.matched.length).toBe(1);
  });

  it("does NOT relocate when drift exceeds window even if hashes exist in window", () => {
    const base = make(
      "a",
      "b",
      "TARGET_A",
      "c",
      "d",
      "e",
      "TARGET_B",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
    );
    const baseFile = buildHashlineFile(base);

    const inserted = ["INS1", "INS2", "INS3", "INS4", "INS5"];
    const modified = make(
      "a",
      "b",
      ...inserted,
      "TARGET_A",
      "c",
      "d",
      "e",
      "TARGET_B",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
    );
    const currentFile = buildHashlineFile(modified);

    const aHash = computeLineHash(baseFile.lines, 2);
    const bHash = computeLineHash(baseFile.lines, 6);
    const resolved = resolveEditAnchors([
      edit(`3#x${aHash}`, `7#x${bHash}`, ["X", "Y", "Z"]),
    ]);

    const exact = partitionExact(resolved, currentFile);
    const fuzzy = fuzzyMatch(exact.unmatched, currentFile);
    expect(fuzzy.matched.length).toBe(0);
  });
});

// No dedicated ambiguity test here — the original implementation already
// rejects matches when a hash collides inside the search window (see the
// `multiple matches — reject` branch in fuzzy-match.ts). Adding a fixture-
// engineered collision would require a synthetic content pattern that's
// noisier than it's worth given how rare the 12-bit hash collision is.
