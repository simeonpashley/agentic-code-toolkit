#!/usr/bin/env npx tsx
/**
 * One-shot fix script. Idempotent — safe to delete after running.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = join(import.meta.dirname, "..", "skills");

const NEURO_BULLET =
  "- `neurodivergent-ux-review` — cognitive load, sensory, time, executive function, predictability, attention, working memory, reading, motor, anxiety, routine.";

const SECTION_RX = /^##\s+Adjacent Agent Delegation\s*$/;
const NEURO_BULLET_RX = /^- `neurodivergent-ux-review`/;
const ANY_BULLET_RX = /^- /;

const skills = [
  "opus-doc-reviewer",
  "trust-and-claims-review",
  "launch-readiness-review",
];

function fixSkill(skill: string): "fixed" | "no-change" | "missing-section" {
  const path = join(SKILLS_DIR, skill, "SKILL.md");
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");

  const sectionStart = lines.findIndex((l) => SECTION_RX.test(l));
  if (sectionStart === -1) return "missing-section";

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) {
      sectionEnd = i;
      break;
    }
  }

  // Find the first neurodivergent bullet in the section
  const misplacedAt = lines
    .slice(sectionStart + 1, sectionEnd)
    .findIndex((l) => NEURO_BULLET_RX.test(l));
  if (misplacedAt === -1) return "no-change";

  // Remove it
  const newLines = [...lines];
  const removeIdx = sectionStart + 1 + misplacedAt;
  newLines.splice(removeIdx, 1);

  // Find the last bullet now in the (shifted) section
  let newLastBullet = -1;
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    if (ANY_BULLET_RX.test(newLines[i]!)) newLastBullet = i;
  }
  if (newLastBullet === -1) return "no-change";

  newLines.splice(newLastBullet + 1, 0, NEURO_BULLET);
  writeFileSync(path, newLines.join("\n"));
  return "fixed";
}

for (const skill of skills) {
  const result = fixSkill(skill);
  const sym = result === "fixed" ? "✓" : result === "no-change" ? "·" : "?";
  console.log(`  ${sym} ${skill} — ${result}`);
}
