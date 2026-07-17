#!/usr/bin/env npx tsx
/**
 * Migrate `always_with` from frontmatter into a workflow-text
 * "## Adjacent Agent Delegation" section.
 *
 * For each skill that has `always_with:`:
 *   1. Extract the list
 *   2. Remove the always_with block from frontmatter
 *   3. Insert a new `## Adjacent Agent Delegation` section
 *      immediately after the opening lead-in paragraph and
 *      before `## Pre-Flight` (or first existing `## ` heading).
 *
 * Idempotent: if `## Adjacent Agent Delegation` already exists,
 * the script aborts for that skill (no overwrite).
 *
 * This is a one-shot migration script. Safe to delete after run.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = join(import.meta.dirname, "..", "skills");

const DELEGATION_INTENT: Record<string, string> = {
  "opus-doc-reviewer":
    "the primary doc/component reviewer — orchestrates the doc-tier specialists",
  "opus-code-quality-reviewer":
    "for code-quality context on the files under review",
  "opus-test-reviewer":
    "for test-coverage and regression context on the files under review",
  "opus-db-reviewer":
    "for database/migration/SQL context if data layer is involved",
  "opus-security-reviewer":
    "for security/secrets/auth/logging exposure on the surface area",
  "opus-operational-safety-reviewer":
    "for config/env/feature-flag/guardrail context on operational changes",
};

function defaultIntent(name: string): string {
  return `adjacent reviewer (${name}) — invoke per its own trigger scope`;
}

function splitFrontmatter(
  content: string,
): { raw: string; body: string } | null {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  return { raw: m[1]!, body: m[2]! };
}

function extractAlwaysWith(fm: string): string[] {
  const block = fm.match(/^[ \t]*always_with:\n((?:[ \t]*-\s+"[^"]*"\n?)+)/m);
  if (!block) return [];
  const list = block[1]!;
  const items: string[] = [];
  for (const line of list.split("\n")) {
    const item = line.match(/^\s*-\s+"([^"]+)"\s*$/);
    if (item) items.push(item[1]!);
  }
  return items;
}

function removeAlwaysWith(fm: string): string {
  return fm.replace(/^[ \t]*always_with:\n((?:[ \t]*-\s+"[^"]*"\n?)+)/m, "");
}

function buildDelegationSection(items: string[]): string {
  const lines = ["", "## Adjacent Agent Delegation", ""];
  lines.push("When triggered, also invoke:");
  lines.push("");
  if (items.length === 0) {
    lines.push("- (none defined — this skill does not auto-delegate)");
  } else {
    for (const name of items) {
      const intent = DELEGATION_INTENT[name] ?? defaultIntent(name);
      lines.push(`- \`${name}\` — ${intent}.`);
    }
  }
  return lines.join("\n") + "\n";
}

function hasDelegationSection(body: string): boolean {
  return /^##\s+Adjacent Agent Delegation\s*$/m.test(body);
}

function migrateFile(skillName: string): {
  status: "migrated" | "skipped-no-always-with" | "skipped-has-section";
  items: string[];
} {
  const path = join(SKILLS_DIR, skillName, "SKILL.md");
  const content = readFileSync(path, "utf-8");
  const split = splitFrontmatter(content);
  if (!split) return { status: "skipped-no-always-with", items: [] };

  const items = extractAlwaysWith(split.raw);
  if (items.length === 0) {
    return { status: "skipped-no-always-with", items: [] };
  }

  const body = split.body;
  if (hasDelegationSection(body)) {
    return { status: "skipped-has-section", items };
  }

  const newFm = removeAlwaysWith(split.raw);

  // Find first `## ` heading; insert delegation section before it
  const lines = body.split("\n");
  let firstHeading = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) {
      firstHeading = i;
      break;
    }
  }

  const delegation = buildDelegationSection(items);
  let newBody: string;
  if (firstHeading === -1) {
    newBody = body.trimEnd() + "\n\n" + delegation;
  } else {
    const before = lines.slice(0, firstHeading);
    const after = lines.slice(firstHeading);
    newBody = [...before, delegation.trimEnd(), "", ...after].join("\n");
  }

  const newContent = `---\n${newFm}\n---\n${newBody}`;
  writeFileSync(path, newContent);
  return { status: "migrated", items };
}

function main(): void {
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

  let migrated = 0;
  let skippedNoAw = 0;
  let skippedHasSection = 0;

  for (const skill of skills) {
    const result = migrateFile(skill);
    if (result.status === "migrated") {
      console.log(`  ✓ ${skill} → migrated (${result.items.join(", ")})`);
      migrated++;
    } else if (result.status === "skipped-has-section") {
      console.log(`  ~ ${skill} → skipped (already has section)`);
      skippedHasSection++;
    } else {
      console.log(`  · ${skill} → no always_with to migrate`);
      skippedNoAw++;
    }
  }

  console.log(
    `\nSummary: ${migrated} migrated, ${skippedHasSection} skipped (existing section), ${skippedNoAw} no-op.`,
  );
}

main();
