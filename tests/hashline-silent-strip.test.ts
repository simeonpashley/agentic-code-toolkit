import { describe, it, expect } from "vitest";
import {
  buildHashlineFile,
  computeLineHash,
  resolveEditAnchors,
  resolveEditSpans,
  applySpans,
  type HashlineToolEdit,
} from "../extensions/pi-hashline-edit/src/hashline";

function edit(pos: string, end: string, lines: string[]): HashlineToolEdit {
  return { op: "replace", pos, end, lines };
}

function make(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

// BUG: resolveEditSpans silently pops/shifts the agent's `lines` array when
// the first or last replacement line matches the line preceding/following the
// edit range. The comment on the auto-strip block says "silently drop it" but
// the extension's own principle elsewhere ("Silent stripping is no longer
// performed — see AGENTS.md") forbids silent content mutation.
//
// Required new behaviour:
//   1. Emit a warning so the agent knows content was treated as duplication.
//   2. Preserve the agent's `lines` verbatim so the result reflects what the
//      agent asked for (and the agent can see the warning and self-correct).
//
// These tests are written BEFORE the production fix — they should fail today
// and pass after the fix.

describe("Boundary auto-strip — warn instead of silently drop", () => {
  it("emits a warning when END of replacement matches next surviving line", () => {
    const content = make(
      "import { foo } from './foo';",
      "import { bar } from './bar';", // line 2 — in range
      "import { baz } from './baz';", // line 3 — in range
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

    // NEW contract: at least one warning, mentioning the boundary strip
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(
      result.warnings.some((w) => /boundary/i.test(w) || /duplicat/i.test(w)),
    ).toBe(true);
  });

  it("emits a warning when START of replacement matches preceding line", () => {
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
  });

  it("preserves the agent's lines verbatim (does NOT drop them)", () => {
    // The user-reported bug: lines the model sent are silently deleted.
    // New contract: lines are kept; agent sees a warning and a diff that
    // reflects the duplication (so it can self-correct on retry).
    const content = make(
      "import { foo } from './foo';",
      "import { bar } from './bar';",
      "import { baz } from './baz';",
      "import { qux } from './qux';",
    );
    const file = buildHashlineFile(content);

    const pos = `2#x${computeLineHash(file.lines, 1)}`;
    const end = `3#x${computeLineHash(file.lines, 2)}`;
    const replacement = [
      "import { bar } from './bar';",
      "import { qux } from './qux';", // matches line 4
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const applied = applySpans(file, result.spans);
    // The agent's `lines` are kept verbatim — duplication is the agent's
    // choice to make once it's warned. We do not silently delete content.
    expect(applied.file.lines).toEqual([
      "import { foo } from './foo';",
      "import { bar } from './bar';",
      "import { qux } from './qux';", // ← preserved (was being silently dropped)
      "import { qux } from './qux';", // ← also next-surviving line 4
    ]);
  });
});
