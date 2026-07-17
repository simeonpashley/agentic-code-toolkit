#!/usr/bin/env npx tsx
/**
 * Validate MEMORY.md entries against current code reality.
 *
 * Parses each `- [..] Trigger: .. Rule: .. Verify: ..` entry.
 * Runs the `Verify:` step (shell command or file existence) and reports
 * PASS / FAIL / UNVERIFIABLE per entry.
 *
 * Read-only. Does not modify MEMORY.md.
 *
 * Usage:
 *   npx tsx skills/agent-doc-curation/scripts/validate-memory.ts
 *   MEMORY_PATH=/path/to/MEMORY.md npx tsx ...
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const MEMORY_PATH = process.env.MEMORY_PATH ?? "MEMORY.md";
const VERIFY_TIMEOUT_MS = 30_000;

type Status = "PASS" | "FAIL" | "UNVERIFIABLE";

interface Entry {
  id: string;
  timestamp: string | null;
  area: string;
  trigger: string;
  rule: string;
  verify: string;
  status: Status;
  evidence: string;
}

const ENTRY_RE =
  /^-\s+\[([^\]]+)\](?:\s+\[([^\]]+)\])?\s+Trigger:\s+(.+?)\.\s+Rule:\s+(.+?)\.\s+Verify:\s+(.+?)\.\s*$/;

function isTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

function parseEntry(line: string, index: number): Entry | null {
  const match = ENTRY_RE.exec(line);
  if (!match) return null;

  const [, group1, group2, trigger, rule, verify] = match;
  if (!group1 || !trigger || !rule || !verify) return null;

  const timestamp = isTimestamp(group1) ? group1 : null;
  const area = isTimestamp(group1) ? (group2 ?? "general") : group1;

  return {
    id: `m${index}`,
    timestamp,
    area,
    trigger: trigger.trim(),
    rule: rule.trim(),
    verify: verify.trim(),
    status: "UNVERIFIABLE",
    evidence: "",
  };
}

function looksLikeShellCommand(s: string): boolean {
  return /^(pnpm|npm|npx|node|bash|sh|git|cargo|go|pytest|vitest|jest)\s/.test(
    s,
  );
}

function looksLikeFilePath(s: string): boolean {
  return /^[\w./-]+\.[a-z]{1,4}$/.test(s);
}

function runShellVerify(command: string): { status: Status; evidence: string } {
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  if (!cmd) return { status: "UNVERIFIABLE", evidence: "empty command" };

  try {
    const result = spawnSync(cmd, args, {
      encoding: "utf-8",
      timeout: VERIFY_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });
    if (result.status === 0) {
      return {
        status: "PASS",
        evidence: (result.stdout ?? "").trim().slice(-200) || "ok",
      };
    }
    return {
      status: "FAIL",
      evidence:
        (result.stderr ?? result.stdout ?? "").trim().slice(-200) ||
        `exit ${result.status}`,
    };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    return { status: "FAIL", evidence: e.message };
  }
}

function checkFilePath(path: string): { status: Status; evidence: string } {
  if (existsSync(path)) {
    return { status: "PASS", evidence: `file exists: ${path}` };
  }
  return { status: "FAIL", evidence: `file missing: ${path}` };
}

function extractBacktickedCommand(s: string): string | null {
  // Backticked shell command, e.g. `pnpm run verify` or `npx tsc --noemit`
  const match = s.match(
    /`((?:pnpm|npm|npx|node|bash|sh|git|cargo|go|pytest|vitest|jest)\s+[^`]+)`/,
  );
  return match?.[1] ?? null;
}

function verify(entry: Entry): { status: Status; evidence: string } {
  // Prefer backticked commands (extracts from free-form verify like "`pnpm test` passes")
  const backticked = extractBacktickedCommand(entry.verify);
  if (backticked) {
    return runShellVerify(backticked);
  }
  if (looksLikeShellCommand(entry.verify)) {
    return runShellVerify(entry.verify);
  }
  if (looksLikeFilePath(entry.verify)) {
    return checkFilePath(entry.verify);
  }
  return {
    status: "UNVERIFIABLE",
    evidence: "free-form verify; no machine check",
  };
}

function main(): void {
  if (!existsSync(MEMORY_PATH)) {
    console.error(`MEMORY.md not found at ${MEMORY_PATH}`);
    process.exit(1);
  }

  const content = readFileSync(MEMORY_PATH, "utf-8");
  const lines = content.split("\n");
  const entries: Entry[] = [];

  let entryIndex = 0;
  for (const line of lines) {
    const parsed = parseEntry(line, entryIndex + 1);
    if (parsed) {
      entryIndex++;
      const result = verify(parsed);
      parsed.status = result.status;
      parsed.evidence = result.evidence;
      entries.push(parsed);
    }
  }

  const summary = {
    total: entries.length,
    pass: entries.filter((e) => e.status === "PASS").length,
    fail: entries.filter((e) => e.status === "FAIL").length,
    unverifiable: entries.filter((e) => e.status === "UNVERIFIABLE").length,
  };

  console.log(JSON.stringify({ summary, entries }, null, 2));
}

main();
