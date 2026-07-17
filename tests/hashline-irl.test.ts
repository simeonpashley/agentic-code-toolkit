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

describe("IRL boundary duplication — warn and keep lines (post silent-strip fix)", () => {
  // ── Example 1: example-project/README.md ──────────────────────────────
  // IRL: edit replaces 5 lines (92-96) with 8 lines.
  // Line 1 of replacement == preceding line 91 (before dup)
  // Line 8 of replacement == next surviving line 97 (after dup)
  // Only legit new content: "accessibility.md" slipped into the middle.
  it("Example 1 — both before + after boundaries warn, lines preserved verbatim", () => {
    // Reconstructed to match structure: preceding, 5 edit-range lines, following
    const file = buildHashlineFile(
      make(
        "├── docs/",
        "│   ├── README.md", // ← preceding (matches rep[0])
        "│   ├── principles.md", // range start, index 2
        "│   ├── color.md", // index 3
        "│   ├── typography.md", // index 4
        "│   ├── layout.md", // index 5
        "│   ├── design-variables.md", // range end, index 6
        "│   ├── component-spec.md", // ← next surviving (matches rep[7])
        "│   └── components/",
      ),
    );

    const pos = `3#x${computeLineHash(file.lines, 2)}`; // "principles.md"
    const end = `7#x${computeLineHash(file.lines, 6)}`; // "design-variables.md"
    const replacement = [
      "│   ├── README.md", // dup before
      "│   ├── principles.md",
      "│   ├── accessibility.md", // ← real new content
      "│   ├── color.md",
      "│   ├── typography.md",
      "│   ├── layout.md",
      "│   ├── design-variables.md",
      "│   ├── component-spec.md", // dup after
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Both boundaries warned about (one warning each)
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);

    // Replacement kept verbatim — duplication is visible in the diff.
    // Agent gets the warning + can see the duplication and retry.
    const applied = applySpans(file, result.spans);
    expect(applied.file.lines).toEqual([
      "├── docs/",
      "│   ├── README.md", // surviving line 2 (outside range)
      "│   ├── README.md", // from replacement (boundary dup preserved)
      "│   ├── principles.md",
      "│   ├── accessibility.md", // ← new content
      "│   ├── color.md",
      "│   ├── typography.md",
      "│   ├── layout.md",
      "│   ├── design-variables.md",
      "│   ├── component-spec.md", // from replacement (boundary dup preserved)
      "│   ├── component-spec.md", // surviving line 8
      "│   └── components/",
    ]);
  });

  // ── Example 2: ADR 0004-adopt-example-project.md ───────────────────────
  // IRL: edit removes "Dark mode variables" from an Out of Scope list.
  // Model's replacement includes "Automated build pipeline" which
  // matches the next line that was NOT in the edit range.
  it("Example 2 — after boundary warns, lines preserved verbatim", () => {
    const file = buildHashlineFile(
      make(
        "### Out of scope for MVP",
        "",
        "- Dark mode variables (single-light-mode for MVP).", // index 2
        "- RTL variables.", // index 3
        "- Automated build pipeline (Style Dictionary). First version...", // ← after boundary
        "- Figma plugin integration. Export is manual JSON.",
        "",
        "Full scope: `docs/architecture/example-project-scope.md`",
      ),
    );

    // Model: replace lines 3-4 (Dark mode + RTL) keeping RTL,
    // but accidentally including line 5 (Automated build pipeline)
    const pos = `3#x${computeLineHash(file.lines, 2)}`;
    const end = `4#x${computeLineHash(file.lines, 3)}`;
    const replacement = [
      "- RTL variables.",
      "- Automated build pipeline (Style Dictionary). First version...", // ← dup after
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings.length).toBeGreaterThanOrEqual(1);

    const applied = applySpans(file, result.spans);
    // Replacement kept verbatim — "Automated build pipeline" appears once
    // from replacement and once as surviving line 5. The agent sees both
    // copies in the diff and can self-correct.
    expect(applied.file.lines).toEqual([
      "### Out of scope for MVP",
      "",
      "- RTL variables.", // from replacement
      "- Automated build pipeline (Style Dictionary). First version...", // from replacement (boundary dup preserved)
      "- Automated build pipeline (Style Dictionary). First version...", // ← surviving line 5
      "- Figma plugin integration. Export is manual JSON.",
      "",
      "Full scope: `docs/architecture/example-project-scope.md`",
    ]);
  });

  // ── Example 3: design-variables.md ────────────────────────────────
  // IRL: edit removes "--pave-neutral-border-color-default",
  // Model's replacement includes "--pave-neutral-content-color-default"
  // which matches the line that was already next after edit range.
  it("Example 3 — after boundary warns, correct tokens preserved verbatim", () => {
    const file = buildHashlineFile(
      make(
        "```",
        "--pave-background-base-color",
        "",
        "--pave-neutral-border-color-default", // ← index 3, deleted
        "--pave-disabled-border-color", // index 4
        "--pave-neutral-content-color-default", // ← after boundary, index 5
        "--pave-disabled-content-color",
        "```",
      ),
    );

    const pos = `4#x${computeLineHash(file.lines, 3)}`;
    const end = `5#x${computeLineHash(file.lines, 4)}`;
    // Model kept "--pave-neutral-content-color-default" in replacement = dup
    const replacement = [
      "--pave-disabled-border-color",
      "--pave-neutral-content-color-default", // ← dup after
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings.length).toBeGreaterThanOrEqual(1);

    const applied = applySpans(file, result.spans);
    expect(applied.file.lines).toEqual([
      "```",
      "--pave-background-base-color",
      "",
      "--pave-disabled-border-color",
      "--pave-neutral-content-color-default", // from replacement (boundary dup preserved)
      "--pave-neutral-content-color-default", // ← surviving line 6
      "--pave-disabled-content-color",
      "```",
    ]);
  });

  // ── Example 4: MEMORY.md ──────────────────────────────────────────
  // IRL: single-line edit on "[refactor]" entry.
  // Model's replacement starts with "[editing]" which matches preceding line.
  it("Example 4 — before boundary warns, replacement preserved verbatim", () => {
    const file = buildHashlineFile(
      make(
        "## Testing",
        "",
        "- [testing] Trigger: ...", // index 2
        "- [editing] Trigger: ...", // ← preceding boundary, index 3
        "- [refactor] Trigger: ...", // ← single-line edit range, index 4
        "- [bug] Trigger: ...", // index 5
      ),
    );

    const pos = `5#x${computeLineHash(file.lines, 4)}`;
    const end = `5#x${computeLineHash(file.lines, 4)}`;
    const replacement = [
      "- [editing] Trigger: ...", // ← dup before (line 4, index 3)
      "- [security-filter] Trigger: ...",
      "- [example-project] Trigger: ...",
      "- [guardrails] Trigger: ...",
    ];

    const resolved = resolveEditAnchors([edit(pos, end, replacement)]);
    const result = resolveEditSpans(file, resolved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings.length).toBeGreaterThanOrEqual(1);

    const applied = applySpans(file, result.spans);
    // Replacement kept verbatim — "[editing]" appears once from replacement
    // and once as surviving line 4. Agent sees both in diff.
    expect(applied.file.lines).toEqual([
      "## Testing",
      "",
      "- [testing] Trigger: ...",
      "- [editing] Trigger: ...", // from replacement (boundary dup preserved)
      "- [editing] Trigger: ...", // ← surviving line 4
      "- [security-filter] Trigger: ...",
      "- [example-project] Trigger: ...",
      "- [guardrails] Trigger: ...",
      "- [bug] Trigger: ...",
    ]);
  });
});
