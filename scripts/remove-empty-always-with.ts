#!/usr/bin/env npx tsx
/**
 * Remove empty `always_with:` (no list items) from sub-reviewer frontmatter.
 * These are no-ops at runtime and add no information.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = join(import.meta.dirname, "..", "skills");

function process(skill: string): boolean {
  const path = join(SKILLS_DIR, skill, "SKILL.md");
  const content = readFileSync(path, "utf-8");
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return false;

  const fm = m[1]!;
  // Match `always_with:` followed by either another key (no list items) or end of frontmatter
  const hasListItem = /^[ \t]*always_with:[ \t]*\n[ \t]*-\s+/m.test(fm);
  if (hasListItem) return false;

  // Strip the always_with line entirely (whether or not it has list items below it)
  // Strip the always_with line entirely (whether or not it has list items below it)
  const cleaned = fm.replace(/\n[ \t]*always_with:[ \t]*\n?$/m, "");
  if (cleaned === fm) return false;

  const newContent = `---\n${cleaned}\n---\n${m[2]}`;
  writeFileSync(path, newContent);
  return true;
}

const skills = [
  "opus-code-quality-reviewer",
  "opus-doc-reviewer",
  "opus-operational-safety-reviewer",
];

for (const s of skills) {
  if (process(s)) {
    console.log(`  ✓ ${s} — removed empty always_with`);
  } else {
    console.log(`  · ${s} — no change`);
  }
}
