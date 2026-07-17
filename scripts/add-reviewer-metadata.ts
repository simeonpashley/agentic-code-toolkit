#!/usr/bin/env npx tsx
/**
 * Add disable-model-invocation + metadata.opus.reviewer to all sub-reviewer skills.
 * Run once, idempotent (skips files that already have the metadata).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_DIR = join(__dirname, "..", "skills");

interface ReviewerMeta {
  category: string;
  triggers: { files: string[]; concerns: string[] };
  input_types: string[];
  primary_for: string[];
  always_with: string[];
}

const REVIEWERS: Record<string, ReviewerMeta> = {
  "opus-code-quality-reviewer": {
    category: "code",
    triggers: {
      files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
      concerns: [
        "code quality",
        "maintainability",
        "code smells",
        "naming",
        "error handling",
        "dead code",
        "logging",
        "dependency health",
      ],
    },
    input_types: ["diff", "file", "full-codebase"],
    primary_for: [],
    always_with: [],
  },
  "opus-code-complexity-review": {
    category: "code",
    triggers: {
      files: ["**/*.ts", "**/*.tsx"],
      concerns: ["complexity", "file size", "LOC", "cyclomatic complexity"],
    },
    input_types: ["diff", "file", "full-codebase"],
    primary_for: [],
    always_with: ["opus-code-quality-reviewer"],
  },
  "opus-security-reviewer": {
    category: "security",
    triggers: {
      files: ["**/*.ts", "**/*.tsx", "**/*.env*", ".env*"],
      concerns: [
        "security",
        "secrets",
        "credentials",
        "auth",
        "tokens",
        "PAT",
        "logging",
        "OWASP",
        "CWE",
      ],
    },
    input_types: ["diff", "file", "full-codebase"],
    primary_for: ["security", "auth", "credentials"],
    always_with: ["opus-operational-safety-reviewer"],
  },
  "opus-db-reviewer": {
    category: "data",
    triggers: {
      files: ["**/*.sql", "**/migrations/**", "**/repository/**"],
      concerns: [
        "database",
        "schema",
        "migration",
        "SQL",
        "transactions",
        "indexes",
        "parameterisation",
        "rebuildability",
      ],
    },
    input_types: ["diff", "file", "full-codebase"],
    primary_for: ["database", "migrations", "sql-files"],
    always_with: ["opus-security-reviewer"],
  },
  "opus-data-quality-reviewer": {
    category: "data",
    triggers: {
      files: ["**/ado/**", "**/infrastructure/**", "**/sync/**"],
      concerns: [
        "ADO",
        "data quality",
        "field mapping",
        "sync",
        "data modelling",
        "changed-date",
      ],
    },
    input_types: ["diff", "file", "full-codebase"],
    primary_for: [],
    always_with: ["opus-db-reviewer"],
  },
  "opus-operational-safety-reviewer": {
    category: "ops",
    triggers: {
      files: [
        "tsconfig*.json",
        ".eslintrc*",
        "eslint.config.*",
        "**/*.config.*",
      ],
      concerns: [
        "config",
        "environment",
        "feature flags",
        "tsconfig",
        "ESLint",
        "guardrails",
        "verification pipeline",
      ],
    },
    input_types: ["diff", "file", "full-codebase"],
    primary_for: [],
    always_with: [],
  },
  "opus-test-reviewer": {
    category: "code",
    triggers: {
      files: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
      concerns: [
        "tests",
        "coverage",
        "TDD",
        "test quality",
        "regression",
        "edge cases",
      ],
    },
    input_types: ["diff", "file", "full-codebase"],
    primary_for: ["tests", "coverage", "regression"],
    always_with: ["opus-code-quality-reviewer"],
  },
  "opus-doc-reviewer": {
    category: "docs",
    triggers: {
      files: ["**/*.md", "**/docs/**", "**/specs/**"],
      concerns: [
        "document",
        "spec",
        "plan",
        "PRD",
        "ADR",
        "design doc",
        "requirement",
        "feasibility",
      ],
    },
    input_types: ["document", "plan"],
    primary_for: ["markdown-doc", "plan", "spec", "ADR"],
    always_with: [],
  },
  "data-lifecycle-review": {
    category: "docs",
    triggers: {
      files: ["**/*.md", "**/docs/**"],
      concerns: [
        "data lifecycle",
        "privacy",
        "retention",
        "deletion",
        "telemetry",
        "AI logs",
        "backup",
      ],
    },
    input_types: ["document", "plan"],
    primary_for: [],
    always_with: ["opus-doc-reviewer"],
  },
  "founder-operator-review": {
    category: "docs",
    triggers: {
      files: ["**/*.md", "**/docs/**"],
      concerns: [
        "founder",
        "operator",
        "support burden",
        "bus factor",
        "cost creep",
        "manual work",
        "operational",
      ],
    },
    input_types: ["document", "plan"],
    primary_for: [],
    always_with: ["opus-doc-reviewer"],
  },
  "launch-readiness-review": {
    category: "docs",
    triggers: {
      files: ["**/*.md", "**/docs/**"],
      concerns: [
        "launch",
        "go/no-go",
        "beta",
        "release",
        "rollback",
        "monitoring",
        "incident",
        "Product Hunt",
      ],
    },
    input_types: ["document", "plan"],
    primary_for: [],
    always_with: ["opus-doc-reviewer"],
  },
  "trust-and-claims-review": {
    category: "docs",
    triggers: {
      files: ["**/*.md", "**/*.html"],
      concerns: [
        "trust",
        "claims",
        "overclaiming",
        "evidence",
        "substantiation",
        "privacy claims",
        "security claims",
        "marketing",
      ],
    },
    input_types: ["document", "plan"],
    primary_for: [],
    always_with: ["opus-doc-reviewer"],
  },
};

function findSkillDir(name: string): string | null {
  // Try exact match first
  const exact = join(SKILLS_DIR, name);
  if (existsSync(exact)) return exact;

  // Try fuzzy (some dirs have -skill suffix vs name without)
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const skillPath = join(SKILLS_DIR, e.name);
      const mdPath = join(skillPath, "SKILL.md");
      try {
        const content = readFileSync(mdPath, "utf-8");
        const m = content.match(/^---\nname:\s*(\S+)/m);
        if (m && m[1] === name) return skillPath;
      } catch {
        // File read error — skip this directory
      }
    }
  }
  return null;
}

function updateFrontmatter(filePath: string, meta: ReviewerMeta) {
  let content = readFileSync(filePath, "utf-8");

  // Strip old opus metadata if present with broken [] format (from v1)
  const metaStart = content.indexOf("\nmetadata:\n  opus:");
  const dashAfterMeta = content.indexOf("\n---", metaStart > 0 ? metaStart : 0);
  if (metaStart > 0 && dashAfterMeta > metaStart) {
    // Check if this is the old broken format (contains "[]" as array placeholder)
    const metaBlock = content.slice(metaStart, dashAfterMeta);
    const hasOldFormat =
      metaBlock.includes("primary_for:\n          []") ||
      metaBlock.includes("always_with:\n          []");
    if (hasOldFormat) {
      content = content.slice(0, metaStart) + content.slice(dashAfterMeta);
      console.log(`  RE-UP ${filePath} (fixing old metadata format)`);
    } else {
      console.log(`  SKIP ${filePath} (already has opus metadata)`);
      return;
    }
  } else if (content.includes("role: sub-reviewer")) {
    console.log(`  SKIP ${filePath} (already has opus metadata)`);
    return;
  }

  // Insert disable-model-invocation after name line (if not present)
  if (!content.includes("disable-model-invocation:")) {
    content = content.replace(
      /^(---\nname:\s*\S+\n)/m,
      "$1disable-model-invocation: true\n",
    );
  }

  // Build opus sub-block (without leading "metadata:" key)
  const opusYaml = [
    "  opus:",
    "    role: sub-reviewer",
    "    reviewer:",
    `      category: ${meta.category}`,
    "      triggers:",
    "        files:",
    ...meta.triggers.files.map((f) => `          - "${f}"`),
    "        concerns:",
    ...meta.triggers.concerns.map((c) => `          - "${c}"`),
    "      input_types:",
    ...meta.input_types.map((t) => `          - "${t}"`),
    "      primary_for:",
    ...(meta.primary_for.length
      ? meta.primary_for.map((p) => `        - "${p}"`)
      : []),
    "      always_with:",
    ...(meta.always_with.length
      ? meta.always_with.map((a) => `        - "${a}"`)
      : []),
  ].join("\n");

  // Find frontmatter closing --- (second occurrence)
  const firstDash = content.indexOf("---\n");
  const secondDash = content.indexOf("\n---", firstDash + 4);

  if (secondDash === -1) {
    console.log(`  WARN ${filePath}: cannot find closing ---`);
    return;
  }

  // Check if an existing metadata: block is present (without opus)
  const existingMetaIdx = content.indexOf("\nmetadata:", firstDash);
  if (
    existingMetaIdx > 0 &&
    existingMetaIdx < secondDash &&
    !content.includes("metadata:\n  opus:")
  ) {
    // Append opus into existing metadata block (before closing ---)
    content =
      content.slice(0, secondDash) +
      "\n" +
      opusYaml +
      content.slice(secondDash);
  } else {
    // No existing metadata block: create full metadata: key with opus under it
    const metaYaml = "metadata:\n" + opusYaml;
    content =
      content.slice(0, secondDash) +
      "\n" +
      metaYaml +
      content.slice(secondDash);
  }

  writeFileSync(filePath, content);
  console.log(`  OK ${filePath}`);
}

function main() {
  let count = 0;
  for (const [name, meta] of Object.entries(REVIEWERS)) {
    const dir = findSkillDir(name);
    if (!dir) {
      console.log(`  MISS ${name} — directory not found`);
      continue;
    }
    const mdPath = join(dir, "SKILL.md");
    updateFrontmatter(mdPath, meta);
    count++;
  }
  console.log(`\nProcessed ${count} reviewers.`);
}

main();
