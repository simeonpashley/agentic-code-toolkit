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

describe("Boundary duplication — warn and keep lines (post silent-strip fix)", () => {
  // New contract:
  //   - Emit a warning when boundary matches (don't silently drop).
  //   - Apply replacement verbatim (lines preserved as the agent wrote them).
  it("warns and keeps lines when END of replacement matches next surviving line", () => {
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
    const spanResult = resolveEditSpans(file, resolved);
    expect(spanResult.ok).toBe(true);
    if (!spanResult.ok) return;

    // Warning emitted — agent can see what happened
    expect(spanResult.warnings.length).toBeGreaterThanOrEqual(1);

    const applied = applySpans(file, spanResult.spans);
    // Replacement kept verbatim — duplication is visible in the diff so the
    // agent can self-correct. No silent deletion.
    expect(applied.file.lines).toEqual([
      "import { foo } from './foo';",
      "import { bar } from './bar';",
      "import { qux } from './qux';", // from replacement
      "import { qux } from './qux';", // surviving line 4
    ]);
  });

  it("warns and keeps lines when START of replacement matches preceding line", () => {
    const content = make(
      "import { foo } from './foo';", // line 1 — preceding
      "import { bar } from './bar';", // line 2 — in range
      "import { baz } from './baz';", // line 3 — in range
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
    const spanResult = resolveEditSpans(file, resolved);
    expect(spanResult.ok).toBe(true);
    if (!spanResult.ok) return;

    expect(spanResult.warnings.length).toBeGreaterThanOrEqual(1);

    const applied = applySpans(file, spanResult.spans);
    // Replacement kept verbatim (start line preserved) — boundary "foo" appears
    // once from replacement, but lines 2-3 of original are replaced by lines
    // 2 of replacement ("baz"). No silent deletion.
    expect(applied.file.lines).toEqual([
      "import { foo } from './foo';", // surviving line 1 (outside range)
      "import { foo } from './foo';", // from replacement (boundary dup preserved)
      "import { baz } from './baz';",
      "import { qux } from './qux';",
    ]);
  });

  it("warns twice and keeps both lines when BOTH boundaries match", () => {
    const content = make(
      "import { foo } from './foo';", // line 1 — preceding
      "import { bar } from './bar';", // line 2 — in range
      "import { baz } from './baz';", // line 3 — in range
      "import { qux } from './qux';", // line 4 — next surviving
    );
    const file = buildHashlineFile(content);

    const pos = `2#x${computeLineHash(file.lines, 1)}`;
    const end = `3#x${computeLineHash(file.lines, 2)}`;
    const replacement = [
      "import { foo } from './foo';", // ← matches line 1
      "import { qux } from './qux';", // ← matches line 4
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const spanResult = resolveEditSpans(file, resolved);
    expect(spanResult.ok).toBe(true);
    if (!spanResult.ok) return;

    expect(spanResult.warnings.length).toBeGreaterThanOrEqual(2);

    const applied = applySpans(file, spanResult.spans);
    // Replacement applied verbatim — result is the same shape as before, but
    // the agent now gets two warnings and a visible diff to act on.
    expect(applied.file.lines).toEqual([
      "import { foo } from './foo';", // surviving line 1 (outside range)
      "import { foo } from './foo';", // from replacement (boundary dup preserved)
      "import { qux } from './qux';", // from replacement (boundary dup preserved)
      "import { qux } from './qux';", // surviving line 4
    ]);
  });

  it("does NOT warn when boundary does not match — replacement applied cleanly", () => {
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
      "import { baz2 } from './baz2';",
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const spanResult = resolveEditSpans(file, resolved);
    expect(spanResult.ok).toBe(true);
    if (!spanResult.ok) return;

    expect(spanResult.warnings.length).toBe(0);

    const applied = applySpans(file, spanResult.spans);
    expect(applied.file.lines).toEqual([
      "import { foo } from './foo';",
      "import { bar } from './bar';",
      "import { baz2 } from './baz2';",
      "import { qux } from './qux';",
    ]);
  });
});
