#!/usr/bin/env npx tsx
/**
 * Validate canonical docs (AGENTS.md, ADRs) against current code reality.
 *
 * For AGENTS.md rules: extracts file paths and shell commands from each
 * tagged bullet, verifies paths exist and commands succeed.
 *
 * For ADRs: extracts paths from the Decision section, verifies existence.
 *
 * Read-only. Emits JSON envelope.
 *
 * Usage:
 *   npx tsx skills/agent-doc-curation/scripts/check-canonical.ts
 *   KIT_ROOT=/path/to/repo npx tsx ...
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const KIT_ROOT = process.env.KIT_ROOT ?? ".";
const AGENTS_PATH =
  process.env.AGENTS_PATH ?? join(KIT_ROOT, "agent/AGENTS.md");
const ADR_DIR = process.env.ADR_DIR ?? join(KIT_ROOT, "docs/adr");
const VERIFY_TIMEOUT_MS = 30_000;

type Status = "VALID" | "DRIFT" | "STALE";

interface RuleCheck {
  source: string;
  line: number;
  text: string;
  tag: string | null;
  status: Status;
  evidence: string;
}

interface AdrCheck {
  file: string;
  title: string;
  status: Status;
  evidence: string;
}

const PATH_RE = /`([^`]+\.\w+)`/g;
const CMD_RE =
  /`(?:pnpm|npm|npx|node|bash|sh|git|cargo|go|pytest|vitest|jest)[^`]+`/g;

function extractPaths(text: string): string[] {
  const matches = text.match(PATH_RE) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

function extractCommands(text: string): string[] {
  const matches = text.match(CMD_RE) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

function looksLikeShellCommand(s: string): boolean {
  return /^(pnpm|npm|npx|node|bash|sh|git|cargo|go|pytest|vitest|jest)\s/.test(
    s,
  );
}

function runCommand(command: string): { ok: boolean; evidence: string } {
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  if (!cmd) return { ok: false, evidence: "empty command" };

  try {
    const result = spawnSync(cmd, args, {
      encoding: "utf-8",
      timeout: VERIFY_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
      cwd: KIT_ROOT,
    });
    if (result.status === 0) {
      return {
        ok: true,
        evidence: (result.stdout ?? "").trim().slice(-200) || "ok",
      };
    }
    return {
      ok: false,
      evidence:
        (result.stderr ?? result.stdout ?? "").trim().slice(-200) ||
        `exit ${result.status}`,
    };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    return { ok: false, evidence: e.message };
  }
}

function checkRule(line: string, lineNum: number, source: string): RuleCheck {
  const tagMatch = line.match(/^-\s+\[([^\]]+)\]/);
  const tag = tagMatch?.[1] ?? null;

  const paths = extractPaths(line);
  const commands = extractCommands(line);

  const missingPaths = paths.filter((p) => !existsSync(p));
  if (missingPaths.length > 0) {
    return {
      source,
      line: lineNum,
      text: line.trim(),
      tag,
      status: "DRIFT",
      evidence: `missing files: ${missingPaths.join(", ")}`,
    };
  }

  for (const cmd of commands) {
    if (looksLikeShellCommand(cmd)) {
      const result = runCommand(cmd);
      if (!result.ok) {
        return {
          source,
          line: lineNum,
          text: line.trim(),
          tag,
          status: "DRIFT",
          evidence: `command failed: ${cmd} → ${result.evidence}`,
        };
      }
    }
  }

  return {
    source,
    line: lineNum,
    text: line.trim(),
    tag,
    status: "VALID",
    evidence:
      paths.length > 0
        ? `${paths.length} paths verified`
        : commands.length > 0
          ? `${commands.length} commands verified`
          : "no machine-checkable elements",
  };
}

function checkAgents(): RuleCheck[] {
  if (!existsSync(AGENTS_PATH)) return [];
  const content = readFileSync(AGENTS_PATH, "utf-8");
  const lines = content.split("\n");
  const results: RuleCheck[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^-\s+\[[^\]]+\]/.test(line)) {
      results.push(checkRule(line, i + 1, "agent/AGENTS.md"));
    }
  }

  return results;
}

function checkAdrs(): AdrCheck[] {
  if (!existsSync(ADR_DIR)) return [];
  let files: string[];
  try {
    files = readdirSync(ADR_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const results: AdrCheck[] = [];
  for (const file of files) {
    const path = join(ADR_DIR, file);
    let content: string;
    try {
      content = readFileSync(path, "utf-8");
    } catch {
      continue;
    }

    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? file;

    const decisionMatch = content.match(
      /## Decision\s*\n([\s\S]*?)(?=\n## |\s*$)/,
    );
    const decisionText = decisionMatch?.[1] ?? content;

    const paths = extractPaths(decisionText);
    const missingPaths = paths.filter((p) => !existsSync(p));

    if (missingPaths.length > 0 && paths.length > 0) {
      results.push({
        file: `docs/adr/${file}`,
        title,
        status: "DRIFT",
        evidence: `decision references missing files: ${missingPaths.join(", ")}`,
      });
    } else {
      results.push({
        file: `docs/adr/${file}`,
        title,
        status: "VALID",
        evidence:
          paths.length > 0
            ? `${paths.length} referenced files exist`
            : "no file references",
      });
    }
  }

  return results;
}

function main(): void {
  const rules = checkAgents();
  const adrs = checkAdrs();

  const summary = {
    rules: {
      total: rules.length,
      valid: rules.filter((r) => r.status === "VALID").length,
      drift: rules.filter((r) => r.status === "DRIFT").length,
    },
    adrs: {
      total: adrs.length,
      valid: adrs.filter((a) => a.status === "VALID").length,
      drift: adrs.filter((a) => a.status === "DRIFT").length,
    },
  };

  console.log(JSON.stringify({ summary, rules, adrs }, null, 2));
}

main();
