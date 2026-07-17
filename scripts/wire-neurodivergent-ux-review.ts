#!/usr/bin/env npx tsx
/**
 * Wire `neurodivergent-ux-review` into the Adjacent Agent Delegation
 * of skills that review public-facing surfaces.
 *
 * For each target skill:
 *   1. If it already has an ## Adjacent Agent Delegation section, append a
 *      bullet for `neurodivergent-ux-review` after the opus-doc-reviewer line.
 *   2. If it does not, create a section with the appropriate list.
 *
 * Idempotent: if the section already lists neurodivergent-ux-review, no-op.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = join(import.meta.dirname, "..", "skills");

const NEURO_BULLET =
  "- `neurodivergent-ux-review` — cognitive load, sensory, time, executive function, predictability, attention, working memory, reading, motor, anxiety, routine.";

const HAS_SECTION_RX = /^##\s+Adjacent Agent Delegation\s*$/m;
const HAS_NEURO_RX = /^-\s+`neurodivergent-ux-review`\s*$/m;

type Action =
  | { type: "append-bullet"; skill: string }
  | { type: "create-section"; skill: string; lines: string[] }
  | { type: "noop"; skill: string; reason: string };

function planAction(skill: string): Action {
  const path = join(SKILLS_DIR, skill, "SKILL.md");
  const content = readFileSync(path, "utf-8");

  if (HAS_NEURO_RX.test(content)) {
    return { type: "noop", skill, reason: "already wired" };
  }

  if (HAS_SECTION_RX.test(content)) {
    return { type: "append-bullet", skill };
  }

  return {
    type: "create-section",
    skill,
    lines: buildNewSection(skill),
  };
}

function buildNewSection(skill: string): string[] {
  // Per-skill delegation lists for skills that don't yet have one
  const SKILL_DELEGATIONS: Record<string, string[]> = {};
  const bullets = SKILL_DELEGATIONS[skill];
  if (!bullets) {
    throw new Error(`No delegation list defined for ${skill}`);
  }
  return [
    "",
    "## Adjacent Agent Delegation",
    "",
    "When triggered, also invoke:",
    "",
    ...bullets,
    "",
  ];
}

function appendBullet(skill: string): void {
  const path = join(SKILLS_DIR, skill, "SKILL.md");
  const content = readFileSync(path, "utf-8");

  // Find the ## Adjacent Agent Delegation line, then find the next list bullet
  // block (consecutive "- " lines) and insert after the first bullet so the
  // new entry sits with the rest.
  const lines = content.split("\n");
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Adjacent Agent Delegation\s*$/.test(lines[i]!)) {
      sectionStart = i;
      break;
    }
  }
  if (sectionStart === -1) throw new Error(`No section in ${skill}`);

  // Find the last bullet in the block immediately after the section header
  let lastBullet = sectionStart;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^- /.test(lines[i]!)) {
      lastBullet = i;
    } else if (lines[i] === "" || lines[i]!.startsWith("#")) {
      // end of bullet block
      break;
    }
  }

  // Insert the new bullet after the last existing bullet
  const newLines = [...lines];
  newLines.splice(lastBullet + 1, 0, NEURO_BULLET);

  writeFileSync(path, newLines.join("\n"));
}

function createSection(skill: string, sectionLines: string[]): void {
  const path = join(SKILLS_DIR, skill, "SKILL.md");
  const content = readFileSync(path, "utf-8");

  // Insert before the first ## heading in the body (after frontmatter)
  const lines = content.split("\n");
  let firstHeading = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) {
      firstHeading = i;
      break;
    }
  }
  if (firstHeading === -1) throw new Error(`No body heading in ${skill}`);

  const newLines = [
    ...lines.slice(0, firstHeading),
    ...sectionLines,
    ...lines.slice(firstHeading),
  ];
  writeFileSync(path, newLines.join("\n"));
}

function main(): void {
  const appendTargets = [
    "opus-doc-reviewer",
    "trust-and-claims-review",
    "launch-readiness-review",
  ];

  const createTargets: string[] = [];

  for (const skill of appendTargets) {
    const action = planAction(skill);
    if (action.type === "append-bullet") {
      appendBullet(skill);
      console.log(`  ✓ ${skill} — appended neurodivergent-ux-review bullet`);
    } else if (action.type === "noop") {
      console.log(`  · ${skill} — ${action.reason}`);
    } else {
      console.log(`  ! ${skill} — unexpected create-section`);
    }
  }

  for (const skill of createTargets) {
    const action = planAction(skill);
    if (action.type === "create-section") {
      createSection(skill, action.lines);
      console.log(`  + ${skill} — created Adjacent Agent Delegation section`);
    } else if (action.type === "noop") {
      console.log(`  · ${skill} — ${action.reason}`);
    } else {
      console.log(`  ! ${skill} — unexpected action: ${action.type}`);
    }
  }
}

main();
