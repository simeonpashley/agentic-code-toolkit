import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractDescription,
  extractReviewerMeta,
  generateSpecialistMap,
  generateScopeTable,
  MANUAL_ENTRIES,
  type ReviewerMeta,
} from "./reviewer-dispatch-lib";

const SKILLS_DIR = join(__dirname, "..", "skills");

describe("extractDescription", () => {
  it("extracts description from inline value", () => {
    const fm = `name: test
description: A simple inline description
extra: true`;
    expect(extractDescription(fm)).toBe("A simple inline description");
  });

  it("extracts description from folded block scalar (>)", () => {
    const fm = `name: test
description: >
  A folded block scalar
  that spans multiple lines
extra: true`;
    expect(extractDescription(fm)).toBe(
      "A folded block scalar that spans multiple lines",
    );
  });

  it("extracts description from literal block scalar (|)", () => {
    const fm = `name: test
description: |
  Line one
  Line two
extra: true`;
    expect(extractDescription(fm)).toBe("Line one\nLine two");
  });

  it("extracts meaningful description from real opus-code-quality-reviewer", () => {
    const content = readFileSync(
      join(SKILLS_DIR, "opus-code-quality-reviewer", "SKILL.md"),
      "utf-8",
    );
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).not.toBeNull();
    const desc = extractDescription(fm![1]!);
    expect(desc).not.toBe("(block scalar)");
    expect(desc).toContain("code quality");
    expect(desc).toContain("maintainability");
  });

  it("extracts meaningful description from real trust-and-claims", () => {
    const content = readFileSync(
      join(SKILLS_DIR, "trust-and-claims-review", "SKILL.md"),
      "utf-8",
    );
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).not.toBeNull();
    const desc = extractDescription(fm![1]!);
    expect(desc).not.toBe("(block scalar)");
    expect(desc).toContain("trust");
    expect(desc).toContain("claims");
  });
});

describe("extractReviewerMeta", () => {
  it("returns correct primary_for for opus-security-reviewer", () => {
    const content = readFileSync(
      join(SKILLS_DIR, "opus-security-reviewer", "SKILL.md"),
      "utf-8",
    );
    const meta = extractReviewerMeta(content, "opus-security-reviewer");
    expect(meta).not.toBeNull();
    expect(meta!.primary_for).toContain("security");
    expect(meta!.primary_for).toContain("auth");
    // Adjacent agent delegation is now encoded in workflow text under
    // "## Adjacent Agent Delegation", not in `always_with` frontmatter.
    expect(meta!.always_with).toEqual([]);
    expect(meta!.category).toBe("security");
    expect(meta!.description).toBeTruthy();
    expect(meta!.description).not.toBe("(block scalar)");
  });

  it("returns correct triggers for opus-db-reviewer", () => {
    const content = readFileSync(
      join(SKILLS_DIR, "opus-db-reviewer", "SKILL.md"),
      "utf-8",
    );
    const meta = extractReviewerMeta(content, "opus-db-reviewer");
    expect(meta).not.toBeNull();
    expect(meta!.triggers.concerns).toContain("database");
    expect(meta!.triggers.files).toContain("**/*.sql");
    expect(meta!.primary_for).toContain("migrations");
    expect(meta!.always_with).toEqual([]);
  });

  it("no sub-reviewer has always_with in frontmatter (refactor to workflow text)", () => {
    const skills = [
      "data-lifecycle-review",
      "founder-operator-review",
      "launch-readiness-review",
      "opus-code-complexity-review",
      "opus-codebase-design-reviewer",
      "opus-data-quality-reviewer",
      "opus-db-reviewer",
      "opus-doc-reviewer",
      "opus-domain-modelling-reviewer",
      "opus-security-reviewer",
      "opus-test-reviewer",
      "trust-and-claims-review",
    ];
    for (const skill of skills) {
      const content = readFileSync(
        join(SKILLS_DIR, skill, "SKILL.md"),
        "utf-8",
      );
      const fm = content.match(/^---\n([\s\S]*?)\n---/);
      expect(fm).not.toBeNull();
      expect(
        fm![1]!.includes("always_with:"),
        `${skill} still has always_with in frontmatter`,
      ).toBe(false);
    }
  });

  it("each skill has at most one Adjacent Agent Delegation section in body", () => {
    const skills = [
      "data-lifecycle-review",
      "founder-operator-review",
      "launch-readiness-review",
      "opus-code-complexity-review",
      "opus-codebase-design-reviewer",
      "opus-data-quality-reviewer",
      "opus-db-reviewer",
      "opus-doc-reviewer",
      "opus-domain-modelling-reviewer",
      "opus-security-reviewer",
      "opus-test-reviewer",
      "trust-and-claims-review",
    ];
    for (const skill of skills) {
      const content = readFileSync(
        join(SKILLS_DIR, skill, "SKILL.md"),
        "utf-8",
      );
      const matches = content.match(/^##\s+Adjacent Agent Delegation\s*$/gm);
      expect(
        matches?.length ?? 0,
        `${skill} should have 0 or 1 delegation section`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("neurodivergent-ux-review is wired into public-surface reviewers", () => {
    const wiredSkills = [
      "opus-doc-reviewer",
      "trust-and-claims-review",
      "launch-readiness-review",
    ];
    for (const skill of wiredSkills) {
      const content = readFileSync(
        join(SKILLS_DIR, skill, "SKILL.md"),
        "utf-8",
      );
      expect(
        content.includes("neurodivergent-ux-review"),
        `${skill} should list neurodivergent-ux-review in Adjacent Agent Delegation`,
      ).toBe(true);
    }
  });

  it("neurodivergent-ux-review itself has Adjacent Agent Delegation section", () => {
    const content = readFileSync(
      join(SKILLS_DIR, "neurodivergent-ux-review", "SKILL.md"),
      "utf-8",
    );
    expect(content).toMatch(/^##\s+Adjacent Agent Delegation\s*$/m);
  });
});

describe("generateSpecialistMap", () => {
  const linesFromMap = (input: string): string[] =>
    input.split("\n").filter((l) => l.startsWith("|"));

  it("produces a well-formed markdown table", () => {
    const map = generateSpecialistMap([]);
    const lines = map.split("\n");
    // Must have header, separator, and at least Self row
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toBe("| Skill | Invokes When | Load Path |");
    expect(lines[1]).toBe("|-------|-------------|-----------|");
  });

  it("lists manual entries before sub-reviewers", () => {
    const subReviewers: ReviewerMeta[] = [
      {
        name: "test-reviewer",
        path: "skills/test-reviewer/SKILL.md",
        description: "Test description",
        category: "test",
        triggers: { files: [], concerns: ["testing"] },
        input_types: [],
        primary_for: [],
        always_with: [],
      },
    ];

    const map = generateSpecialistMap(subReviewers);
    const rows = linesFromMap(map);

    // Find positions of first manual entry and sub-reviewer entry
    const manualIdx = rows.findIndex((r) => r.includes("opus-architect"));
    const subIdx = rows.findIndex((r) => r.includes("test-reviewer"));

    expect(manualIdx).toBeGreaterThanOrEqual(0);
    expect(subIdx).toBeGreaterThan(manualIdx);
  });

  it("lists all 5 manual entries", () => {
    const map = generateSpecialistMap([]);
    const rows = linesFromMap(map);

    const manualNames = MANUAL_ENTRIES.map((m) => m.name);
    for (const name of manualNames) {
      expect(rows.some((r) => r.includes(`\`${name}\``))).toBe(true);
    }
  });

  it("lists Self row last", () => {
    const map = generateSpecialistMap([]);
    const rows = linesFromMap(map);

    const last = rows[rows.length - 1];
    expect(last).toContain("Self (opus-reviewer core)");
  });

  it("has no HTML comments between table rows", () => {
    const map = generateSpecialistMap([]);
    const lines = map.split("\n");

    for (const line of lines) {
      if (line.startsWith("|")) {
        expect(line).not.toContain("<!--");
        expect(line).not.toContain("-->");
      }
    }
  });

  it("table rows have consistent column count (3 columns)", () => {
    const map = generateSpecialistMap([]);
    const rows = linesFromMap(map);
    for (const row of rows) {
      // Each row should have exactly 3 `|` separators (opening + 3 cols = 4 pipes)
      const pipeCount = (row.match(/\|/g) ?? []).length;
      expect(pipeCount, `Row has ${pipeCount} pipes: ${row}`).toBe(4);
    }
  });
});

describe("generateScopeTable", () => {
  it("returns placeholder when no primaries defined", () => {
    const table = generateScopeTable([]);
    expect(table).toContain("No primaries defined");
  });

  it("generates rows for reviewers with primary_for", () => {
    const reviewers: ReviewerMeta[] = [
      {
        name: "security-reviewer",
        path: "skills/s/SKILL.md",
        description: "",
        category: "security",
        triggers: { files: [], concerns: [] },
        input_types: [],
        primary_for: ["security"],
        always_with: [],
      },
    ];

    const table = generateScopeTable(reviewers);
    expect(table).toContain("Security");
    expect(table).toContain("security-reviewer");
  });
});
