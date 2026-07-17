import { describe, it, expect } from "vitest";
import {
  buildHashlineFile,
  computeLineHash,
  resolveEditAnchors,
  resolveEditSpans,
  applySpans,
  type HashlineToolEdit,
} from "../extensions/pi-hashline-edit/src/hashline";
import {
  partitionExact,
  fuzzyMatch,
} from "../extensions/pi-hashline-edit/src/fuzzy-match";
import { threeWayMerge } from "../extensions/pi-hashline-edit/src/merge";

function edit(pos: string, end: string, lines: string[]): HashlineToolEdit {
  return { op: "replace", pos, end, lines };
}

function make(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

describe("Boundary duplication — emit warning, keep lines verbatim", () => {
  // New contract (post silent-strip fix):
  //   - When the first or last line of `lines` matches the line preceding
  //     or following the edit range, emit a warning so the agent knows.
  //   - Keep the lines verbatim — duplication is the agent's choice once
  //     it's warned. We do not silently delete content the agent asked for.
  it("warns when END of replacement matches next surviving line, keeps lines verbatim", () => {
    const content = make(
      "import { foo } from './foo';",
      "import { bar } from './bar';", // line 2
      "import { baz } from './baz';", // line 3
      "import { qux } from './qux';", // line 4 — next surviving
    );
    const file = buildHashlineFile(content);

    const pos = `2#x${computeLineHash(file.lines, 1)}`;
    const end = `3#x${computeLineHash(file.lines, 2)}`;
    const replacement = [
      "import { bar } from './bar';",
      "import { qux } from './qux';", // ← matches line 4
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Warning emitted — agent sees the duplication in tool output
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(
      result.warnings.some((w) => /boundary/i.test(w) || /duplicat/i.test(w)),
    ).toBe(true);

    const applied = applySpans(file, result.spans);
    // Lines preserved verbatim — duplication is visible in the diff so the
    // agent can see what happened and retry without the boundary line.
    expect(applied.file.lines).toEqual([
      "import { foo } from './foo';",
      "import { bar } from './bar';",
      "import { qux } from './qux';", // from replacement (was boundary dup)
      "import { qux } from './qux';", // surviving line 4
    ]);
  });

  it("warns when START of replacement matches preceding line, keeps lines verbatim", () => {
    const content = make(
      "import { foo } from './foo';", // line 1 — preceding
      "import { bar } from './bar';", // line 2
      "import { baz } from './baz';", // line 3
      "import { qux } from './qux';",
    );
    const file = buildHashlineFile(content);

    const pos = `2#x${computeLineHash(file.lines, 1)}`;
    const end = `3#x${computeLineHash(file.lines, 2)}`;
    const replacement = [
      "import { foo } from './foo';", // ← matches line 1
      "import { baz } from './baz';",
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(
      result.warnings.some((w) => /boundary/i.test(w) || /duplicat/i.test(w)),
    ).toBe(true);

    const applied = applySpans(file, result.spans);
    // Line 1 survives (outside range), then replacement verbatim:
    // foo from replacement, baz from replacement, qux surviving.
    // The duplication of "foo" is the agent's choice once warned.
    expect(applied.file.lines).toEqual([
      "import { foo } from './foo';", // surviving line 1 (outside range)
      "import { foo } from './foo';", // from replacement (boundary dup preserved)
      "import { baz } from './baz';",
      "import { qux } from './qux';",
    ]);
  });

  it("both boundaries match → two warnings, replacement applied verbatim", () => {
    const content = make(
      "import { foo } from './foo';", // line 1
      "import { bar } from './bar';", // line 2
      "import { baz } from './baz';", // line 3
      "import { qux } from './qux';", // line 4
    );
    const file = buildHashlineFile(content);

    const pos = `2#x${computeLineHash(file.lines, 1)}`;
    const end = `3#x${computeLineHash(file.lines, 2)}`;
    const replacement = [
      "import { foo } from './foo';", // ← matches line 1
      "import { qux } from './qux';", // ← matches line 4
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Two warnings — one per boundary
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);

    const applied = applySpans(file, result.spans);
    // Replacement applied verbatim — "foo" from rep[0] + "qux" from rep[1],
    // both kept; result shows both copies so agent can self-correct.
    expect(applied.file.lines).toEqual([
      "import { foo } from './foo';", // surviving line 1 (outside range)
      "import { foo } from './foo';", // from replacement (boundary dup preserved)
      "import { qux } from './qux';", // from replacement (boundary dup preserved)
      "import { qux } from './qux';", // surviving line 4
    ]);
  });
});

describe("fuzzyMatch and threeWayMerge behavior", () => {
  it("fuzzyMatch cannot relocate when surrounding context changes", () => {
    const base = make(
      "function foo() {",
      "  const x = 1;",
      "  const y = 2;",
      "  return x + y;",
      "}",
    );
    const originalFile = buildHashlineFile(base);

    // File changes: new line inserted before target
    const modified = make(
      "function foo() {",
      "  const x = 1;",
      "  console.log('debug');", // ← inserted, shifts context
      "  const y = 2;",
      "  return x + y;",
      "}",
    );
    const currentFile = buildHashlineFile(modified);

    // Edit authored against original: replace line 3
    const line3Hash = computeLineHash(originalFile.lines, 2);
    const resolved = resolveEditAnchors([
      edit(`3#x${line3Hash}`, `3#x${line3Hash}`, ["  const z = 2;"]),
    ]);

    // Exact match fails (line 3 is now console.log)
    const exact = partitionExact(resolved, currentFile);
    expect(exact.unmatched.length).toBe(1);

    // Fuzzy match also fails — hash changed because prev line changed
    const fuzzy = fuzzyMatch(exact.unmatched, currentFile);
    expect(fuzzy.matched.length).toBe(0);
  });

  it("threeWayMerge returns baseEdited when base === current (no external changes)", () => {
    const base = make("line 1", "line 2", "line 3");
    const baseEdited = make("line 1", "line 2", "line 3"); // no-op
    const current = make("line 1", "line 2", "line 3");

    const result = threeWayMerge(base, baseEdited, current);
    // base === current, so returns baseEdited directly
    expect(result).toBe(base);
  });

  it("threeWayMerge applies changes when base differs", () => {
    const base = make("line 1", "line 2", "line 3");
    const baseEdited = make("line 1", "line 2", "line 3", "line 4");
    const current = make("line 1", "line 2", "line 3", "line 5");

    const result = threeWayMerge(base, baseEdited, current);
    expect(result).not.toBeNull();
    if (result === null) return;

    const lines = result.split("\n").filter((l) => l);
    expect(lines).toEqual(["line 1", "line 2", "line 3", "line 4", "line 5"]);
  });
});
