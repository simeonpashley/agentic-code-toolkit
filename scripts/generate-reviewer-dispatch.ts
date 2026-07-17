#!/usr/bin/env npx tsx
/**
 * Scan skills/ for sub-reviewer SKILL.md files, extract metadata.opus.reviewer,
 * generate dispatch tables into skills/opus-reviewer/SKILL.md between sentinel comments.
 *
 * Idempotent — replaces content between BEGIN/END sentinels.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractReviewerMeta,
  type ReviewerMeta,
  generateScopeTable,
  generateSpecialistMap,
} from "./reviewer-dispatch-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_DIR = join(__dirname, "..", "skills");
const ORCHESTRATOR = join(SKILLS_DIR, "opus-reviewer", "SKILL.md");

const SENTINEL_SCOPE_START = "<!-- AUTO-GENERATED-SCOPE-TABLE-START -->";
const SENTINEL_SCOPE_END = "<!-- AUTO-GENERATED-SCOPE-TABLE-END -->";
const SENTINEL_MAP_START = "<!-- AUTO-GENERATED-SPECIALIST-MAP-START -->";
const SENTINEL_MAP_END = "<!-- AUTO-GENERATED-SPECIALIST-MAP-END -->";

function scanReviewers(): ReviewerMeta[] {
  const reviewers: ReviewerMeta[] = [];
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const mdPath = join(SKILLS_DIR, d.name, "SKILL.md");
    let content: string;
    try {
      content = readFileSync(mdPath, "utf-8");
    } catch {
      continue;
    }

    const meta = extractReviewerMeta(content, d.name);
    if (meta) reviewers.push(meta);
  }

  return reviewers;
}

function injectSection(
  content: string,
  startSentinel: string,
  endSentinel: string,
  replacement: string,
): string {
  const startIdx = content.indexOf(startSentinel);
  const endIdx = content.indexOf(endSentinel);

  if (startIdx === -1 || endIdx === -1) {
    const step2Idx = content.indexOf("## Step 2:");
    if (step2Idx !== -1) {
      const afterStep2 = content.indexOf("\n\n## Step 3:", step2Idx);
      const insertPoint = afterStep2 !== -1 ? afterStep2 : content.length;
      const before = content.slice(0, insertPoint);
      const after = content.slice(insertPoint);
      return `${before}\n${startSentinel}\n${replacement}\n${endSentinel}\n${after}`;
    }
    return content;
  }

  const before = content.slice(0, startIdx + startSentinel.length);
  const after = content.slice(endIdx);
  return `${before}\n${replacement}\n${after}`;
}

function main(): void {
  const reviewers = scanReviewers();
  console.log(`Found ${reviewers.length} sub-reviewers:\n`);

  for (const r of reviewers) {
    console.log(
      `  ${r.name} (${r.category}) — primary_for: [${r.primary_for.join(", ") || "none"}]`,
    );
  }

  let content = readFileSync(ORCHESTRATOR, "utf-8");

  const scopeTable = generateScopeTable(reviewers);
  content = injectSection(
    content,
    SENTINEL_SCOPE_START,
    SENTINEL_SCOPE_END,
    scopeTable,
  );

  const specialistMap = generateSpecialistMap(reviewers);
  content = injectSection(
    content,
    SENTINEL_MAP_START,
    SENTINEL_MAP_END,
    specialistMap,
  );

  writeFileSync(ORCHESTRATOR, content);
  console.log(`\nUpdated ${ORCHESTRATOR}`);
}

main();
