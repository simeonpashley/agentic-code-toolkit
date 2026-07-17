#!/usr/bin/env npx tsx
/**
 * Migrate a MEMORY.md entry to a canonical document.
 *
 * Usage:
 *   npx tsx migrate-entry.ts <entry-id> <destination>
 *
 * Destinations:
 *   AGENTS.md            — append the entry's rule as a `[doc]` tagged bullet
 *   adr:<title>          — create docs/adr/NNNN-<slug>.md from the entry
 *   CONTEXT.md           — append a glossary term
 *
 * The MEMORY.md entry is removed after successful migration.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MEMORY_PATH = process.env.MEMORY_PATH ?? "MEMORY.md";
const AGENTS_PATH = process.env.AGENTS_PATH ?? "agent/AGENTS.md";
const ADR_DIR = process.env.ADR_DIR ?? "docs/adr";
const CONTEXT_PATH = process.env.CONTEXT_PATH ?? "CONTEXT.md";

const ENTRY_RE =
  /^-\s+\[([^\]]+)\](?:\s+\[([^\]]+)\])?\s+Trigger:\s+(.+?)\.\s+Rule:\s+(.+?)\.\s+Verify:\s+(.+?)\.\s*$/;

interface ParsedEntry {
  line: number;
  raw: string;
  timestamp: string | null;
  area: string;
  trigger: string;
  rule: string;
  verify: string;
}

function isTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

function parseEntry(raw: string, line: number): ParsedEntry | null {
  const match = ENTRY_RE.exec(raw);
  if (!match) return null;

  const [, group1, group2, trigger, rule, verify] = match;
  if (!group1 || !trigger || !rule || !verify) return null;

  const timestamp = isTimestamp(group1) ? group1 : null;
  const area = isTimestamp(group1) ? (group2 ?? "general") : group1;

  return {
    line,
    raw,
    timestamp,
    area,
    trigger: trigger.trim(),
    rule: rule.trim(),
    verify: verify.trim(),
  };
}

function findEntry(content: string, entryId: string): ParsedEntry | null {
  const lines = content.split("\n");
  let id = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (!/^-\s+\[.+\]/.test(line)) continue;

    id++;
    const candidateId = `m${id}`;
    if (candidateId !== entryId) continue;

    const parsed = parseEntry(line, i);
    if (parsed) return parsed;
  }
  return null;
}

function removeEntry(content: string, entry: ParsedEntry): string {
  const lines = content.split("\n");
  lines.splice(entry.line, 1);
  return lines.join("\n");
}

function ensureFile(path: string, defaultContent: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, defaultContent);
  }
}

function migrateToAgents(entry: ParsedEntry): void {
  ensureFile(AGENTS_PATH, "# Agent Instructions\n\n");
  const content = readFileSync(AGENTS_PATH, "utf-8");
  const newRule = `\n- [doc] ${entry.rule}\n`;
  writeFileSync(AGENTS_PATH, content + newRule);
}

function nextAdrNumber(): string {
  if (!existsSync(ADR_DIR)) return "0001";
  const files = readdirSync(ADR_DIR).filter((f) => /^\d{4}-/.test(f));
  const numbers = files
    .map((f) => Number.parseInt(f.slice(0, 4), 10))
    .filter((n) => Number.isFinite(n));
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return String(max + 1).padStart(4, "0");
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "decision"
  );
}

function migrateToAdr(entry: ParsedEntry, title: string): void {
  ensureFile(join(ADR_DIR, ".gitkeep"), "");
  const num = nextAdrNumber();
  const slug = slugify(title);
  const filename = `${num}-${slug}.md`;
  const filepath = join(ADR_DIR, filename);

  const date = entry.timestamp
    ? entry.timestamp.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const content = `# ${num}. ${title}

- **Status:** Accepted
- **Date:** ${date}
- **Area:** ${entry.area}

## Context

${entry.trigger}

## Decision

${entry.rule}

## Verification

${entry.verify}
`;

  writeFileSync(filepath, content);
}

function migrateToContext(entry: ParsedEntry): void {
  ensureFile(CONTEXT_PATH, "# Context\n\nUbiquitous language glossary.\n\n");
  const content = readFileSync(CONTEXT_PATH, "utf-8");
  const term = entry.rule.split(/\s+/).slice(0, 3).join(" ");
  const newTerm = `\n- **${term}** — ${entry.rule}\n`;
  writeFileSync(CONTEXT_PATH, content + newTerm);
}

function main(): void {
  const [entryId, destination] = process.argv.slice(2);
  if (!entryId || !destination) {
    console.error(
      "Usage: migrate-entry.ts <entry-id> <AGENTS.md|adr:<title>|CONTEXT.md>",
    );
    process.exit(1);
  }

  if (!existsSync(MEMORY_PATH)) {
    console.error(`MEMORY.md not found at ${MEMORY_PATH}`);
    process.exit(1);
  }

  const content = readFileSync(MEMORY_PATH, "utf-8");
  const entry = findEntry(content, entryId);
  if (!entry) {
    console.error(`Entry ${entryId} not found in MEMORY.md`);
    process.exit(1);
  }

  if (destination === "AGENTS.md") {
    migrateToAgents(entry);
  } else if (destination.startsWith("adr:")) {
    const title = destination.slice(4).trim();
    if (!title) {
      console.error("adr destination requires a title: adr:<title>");
      process.exit(1);
    }
    migrateToAdr(entry, title);
  } else if (destination === "CONTEXT.md") {
    migrateToContext(entry);
  } else {
    console.error(
      `Unknown destination: ${destination}. Use AGENTS.md, adr:<title>, or CONTEXT.md`,
    );
    process.exit(1);
  }

  const updated = removeEntry(content, entry);
  writeFileSync(MEMORY_PATH, updated);

  console.log(
    JSON.stringify(
      { migrated: entryId, to: destination, success: true },
      null,
      2,
    ),
  );
}

main();
