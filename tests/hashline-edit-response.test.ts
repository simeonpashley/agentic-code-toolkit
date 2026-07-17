import { describe, expect, it } from "vitest";
import {
  buildChangedResponse,
  buildConflictResponse,
} from "../extensions/pi-hashline-edit/src/edit-response";
import { computeLineHash } from "../extensions/pi-hashline-edit/src/hashline";

describe("hashline edit response contextual payloads", () => {
  it("returns a recalibration window with fresh anchors after successful edits", () => {
    const original = [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
    ].join("\n");
    const result = [
      "alpha",
      "beta changed",
      "gamma inserted",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
    ].join("\n");

    const response = buildChangedResponse({
      path: "example.ts",
      originalNormalized: original,
      result,
      warnings: undefined,
      snapshotId: "snapshot-1",
      editsAttempted: 1,
      noopEditsCount: 0,
    });

    expect(response.details.recalibration_window).toMatchObject({
      status: "applied",
      path: "example.ts",
      start_line: 1,
      end_line: 7,
    });
    expect(response.details.recalibration_window.lines).toContain(
      `2#x${computeLineHash(result.split("\n"), 1)}│beta changed`,
    );
    expect(response.details.recalibration_window.lines).toContain(
      `3#x${computeLineHash(result.split("\n"), 2)}│gamma inserted`,
    );
    expect(response.content[0]?.text).toContain("Edit applied.");
    expect(response.content[0]?.text).toContain("recalibration_window");
    expect(response.content[0]?.text).not.toContain("@@");
    expect(response.details.diff).toBeDefined();
    expect(response.details.diff).toMatch(/│/);
  });

  it("returns structured conflict state with expected and actual line data", () => {
    const currentLines = ["alpha", "beta current", "gamma"];
    const response = buildConflictResponse({
      path: "example.ts",
      mismatches: [
        {
          line: 2,
          expected: "BAD",
          actual: computeLineHash(currentLines, 1),
        },
      ],
      fileLines: currentLines,
      message: "stale anchor",
    });

    expect(response.isError).toBe(true);
    expect(response.details.conflict).toMatchObject({
      status: "failed",
      reason: "HASH_MISMATCH",
      path: "example.ts",
      expected: [
        {
          anchor: "2#xBAD",
          line: 2,
          hash: "BAD",
        },
      ],
      actual: [
        {
          anchor: `2#x${computeLineHash(currentLines, 1)}`,
          line: 2,
          hash: computeLineHash(currentLines, 1),
          text: "beta current",
        },
      ],
    });
    expect(response.content[0]?.text).toContain('"reason":"HASH_MISMATCH"');
  });
});
