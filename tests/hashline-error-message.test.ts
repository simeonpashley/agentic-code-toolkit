import { describe, it, expect } from "vitest";
import {
  buildHashlineFile,
  computeLineHash,
  formatMismatchError,
  type HashMismatch,
} from "../extensions/pi-hashline-edit/src/hashline";

function make(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

describe("formatMismatchError — agent-readable diagnostics", () => {
  it("classifies anchors that are out-of-bounds as OOB", () => {
    const file = buildHashlineFile(make("a", "b", "c")); // 3 lines
    const mismatches: HashMismatch[] = [
      { line: 99, expected: "ABC", actual: "OOB" },
    ];
    const out = formatMismatchError(mismatches, file.lines);
    // The error must flag the OOB anchor distinctly from a hash mismatch so
    // the agent knows whether to fix the line number vs re-read the file.
    expect(out).toMatch(/OOB/i);
    expect(out).toMatch(/line number/i);
    expect(out).not.toMatch(/re-hash|hash has changed/i);
  });

  it("explains hash drift when the file is in fact stale", () => {
    const file = buildHashlineFile(make("a", "b", "c")); // 3 lines
    const mismatches: HashMismatch[] = [
      { line: 2, expected: "OLD", actual: "NEW" },
    ];
    const out = formatMismatchError(mismatches, file.lines);
    expect(out).toMatch(/E_STALE_ANCHOR/);
    // Must suggest re-reading so the agent doesn't retry with stale anchors.
    expect(out).toMatch(/re-read|read the file again/i);
  });

  it("suggests smaller / more focused edits when retrying", () => {
    const file = buildHashlineFile(make("a", "b", "c")); // 3 lines
    const mismatches: HashMismatch[] = [
      { line: 2, expected: "OLD", actual: "DIFFERENT" },
    ];
    const out = formatMismatchError(mismatches, file.lines);
    // The agent shouldn't be sent into an infinite retry loop — the message
    // should suggest smaller, more targeted edits as one safe path forward.
    expect(out).toMatch(/smaller|focused|single|one anchor|tiny|tighter/i);
  });

  it("lists all unique mismatched anchors, no duplicates", () => {
    const file = buildHashlineFile(make("a", "b", "c"));
    const mismatches: HashMismatch[] = [
      { line: 2, expected: "ABC", actual: "DIFF" },
      { line: 2, expected: "ABC", actual: "DIFF" }, // duplicate
      { line: 3, expected: "XYZ", actual: "DIFF" },
    ];
    const out = formatMismatchError(mismatches, file.lines);
    expect(out).toContain("2#xABC");
    expect(out).toContain("3#xXYZ");
    // 2 unique (deduped) → "2 stale anchors"
    expect(out).toMatch(/2 stale anchors?/);
  });

  it("includes both the requested and the live-computed hash in the diagnostic", () => {
    // The engine reports the LIVE hash at the requested line, not whatever the
    // caller put in `actual`. Verifying this means an agent can diff the two
    // hashes inline without re-reading the file to count lines.
    const file = buildHashlineFile(make("a", "b", "c"));
    const mismatches: HashMismatch[] = [
      { line: 2, expected: "OLD", actual: "OLD" },
    ];
    const out = formatMismatchError(mismatches, file.lines);
    // The requested hash must appear (it was what the agent sent).
    expect(out).toContain("xOLD");
    // The live-computed hash at line 2 of "a\nb\nc" must also appear.
    const liveHash = computeLineHash(file.lines, 1);
    expect(out).toContain(`x${liveHash}`);
    // And both together in one diff line.
    expect(out).toMatch(/requested .*actual/);
  });

  it("makes the retry anchors copy-pasteable (>>> prefix)", () => {
    // The >>> prefix is what the agent should copy back into the next edit.
    const file = buildHashlineFile(make("a", "b", "c"));
    const mismatches: HashMismatch[] = [
      { line: 2, expected: "ABC", actual: "DIFFERENT" },
    ];
    const out = formatMismatchError(mismatches, file.lines);
    expect(out).toMatch(/>>>.*2#x/);
  });
});

describe("formatMismatchError — boundaries", () => {
  it("returns a sensible message even when the file is empty", () => {
    // Edge: file shrunk to empty between read and edit.
    const file = buildHashlineFile("");
    const mismatches: HashMismatch[] = [
      { line: 1, expected: "ABC", actual: "OOB" },
    ];
    const out = formatMismatchError(mismatches, file.lines);
    expect(out).toContain("1#xABC");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("[object Object]");
  });

  it("handles a fully-OOB batch with no actual hashes", () => {
    const file = buildHashlineFile(make("a", "b"));
    const mismatches: HashMismatch[] = [
      { line: 50, expected: "ABC", actual: "OOB" },
      { line: 51, expected: "DEF", actual: "OOB" },
    ];
    const out = formatMismatchError(mismatches, file.lines);
    expect(out).toContain("50#xABC");
    expect(out).toContain("51#xDEF");
    expect(out).toMatch(/2 stale anchors?/);
  });

  it("handles batch-stale anchors after large insertions above target", () => {
    // Simulates the user-reported scenario: agent read a file with ~200 lines,
    // inserted 117 lines above the original target, then submitted an edit using
    // pre-insertion anchors. The hashes at the original line numbers no longer match.
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
    const file = buildHashlineFile(make(...lines));

    // Three stale anchors: the line numbers exist but content has changed
    const mismatches: HashMismatch[] = [
      { line: 50, expected: "AAA", actual: computeLineHash(file.lines, 49) },
      { line: 80, expected: "BBB", actual: computeLineHash(file.lines, 79) },
      { line: 120, expected: "CCC", actual: computeLineHash(file.lines, 119) },
    ];

    const out = formatMismatchError(mismatches, file.lines);

    // Must classify as E_STALE_ANCHOR with hash drift
    expect(out).toMatch(/E_STALE_ANCHOR/);
    expect(out).toMatch(/3 stale anchors?/);
    expect(out).toContain("50#xAAA");
    expect(out).toContain("80#xBBB");
    expect(out).toContain("120#xCCC");
    // Must suggest re-reading the file
    expect(out).toMatch(/re-read/i);
    // Must include the "shifted by many lines" remediation hint
    expect(out).toMatch(/shifted by many lines/i);
    // Must NOT mention OOB (these anchors are in-bounds, just stale)
    expect(out).not.toMatch(/OOB/);
  });
});
