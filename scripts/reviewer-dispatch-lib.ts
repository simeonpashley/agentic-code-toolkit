// ── YAML frontmatter parser for SKILL.md files ──────────────────────

type YamlScalar = string | boolean | null;
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
interface YamlObject extends Record<string, YamlValue> {}
type YamlValue = YamlScalar | YamlObject | YamlValue[];

function yGet(obj: YamlValue | undefined, key: string): YamlValue | undefined {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj))
    return undefined;
  const map: Record<string, YamlValue | undefined> = obj;
  return map[key];
}

function isYamlObject(v: YamlValue | undefined): v is YamlObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ySet(obj: YamlObject, key: string, value: YamlValue): void {
  obj[key] = value;
}

function yPush(obj: YamlObject, key: string, value: string): void {
  const existing = yGet(obj, key);
  if (existing === undefined) {
    ySet(obj, key, [value]);
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else if (isYamlObject(existing) && Object.keys(existing).length === 0) {
    // Replace empty placeholder object (from YAML key:) with array
    ySet(obj, key, [value]);
  } else {
    ySet(obj, key, [existing, value]);
  }
}

function parseFrontmatter(content: string): YamlObject | null {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m || m[1] === undefined) return null;
  const raw = m[1];
  const result: YamlObject = {};
  const path: Array<{ key: string; container: YamlObject; indent: number }> =
    [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const trimmedBlock = line.trim();
    if (
      /^\s{2,}\S/.test(line) &&
      !trimmedBlock.includes(":") &&
      !trimmedBlock.startsWith("- ")
    ) {
      continue;
    }
    const indent = line.search(/\S/);
    const trimmed = line.trim();

    while (path.length > 0) {
      const top = path.at(-1);
      if (!top || top.indent < indent) break;
      path.pop();
    }

    let container: YamlObject = result;
    for (const p of path) {
      container = p.container;
    }

    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).replace(/^"(.*)"$/, "$1");
      const last = path.at(-1);
      if (last) {
        // Container should be parent of last path entry (the object the array lives on)
        let parent: YamlObject = result;
        for (let i = 0; i < path.length - 1; i++) {
          const entry = path.at(i);
          if (entry) parent = entry.container;
        }
        yPush(parent, last.key, value);
      }
    } else if (trimmed.includes(":")) {
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      if (value === "" || value === "{}") {
        const obj: YamlObject = {};
        ySet(container, key, obj);
        path.push({ key, container: obj, indent });
      } else if (value === "[]") {
        ySet(container, key, []);
      } else if (
        value === ">" ||
        value === "|" ||
        value === "|-" ||
        value === ">-"
      ) {
        ySet(container, key, "(block scalar)");
      } else if (value === "true") {
        ySet(container, key, true);
      } else if (value === "false") {
        ySet(container, key, false);
      } else {
        ySet(
          container,
          key,
          value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"),
        );
      }
    }
  }
  return result;
}

/**
 * Extract the description value from raw frontmatter text.
 * Handles both block scalars (description: > ...) and inline values.
 */
export function extractDescription(rawFrontmatter: string): string {
  // Match description: > with indented continuation
  const blockMatch = rawFrontmatter.match(
    /^description:\s*>\s*\n((?:\s{2,}\S[^\n]*\n?)*)/m,
  );
  if (blockMatch) {
    const raw = blockMatch[1];
    if (raw === undefined) return "";
    const lines = raw.split("\n");
    // Find common indentation from first non-empty line
    const firstLine = lines.find((l) => l.trim().length > 0);
    const commonIndent = firstLine ? firstLine.search(/\S/) : 0;
    return lines
      .map((l) => l.slice(commonIndent).trim())
      .filter((l) => l.length > 0)
      .join(" ");
  }

  // Match description: | (literal block)
  const literalMatch = rawFrontmatter.match(
    /^description:\s*\|\s*\n((?:\s{2,}\S[^\n]*\n?)*)/m,
  );
  if (literalMatch) {
    const raw = literalMatch[1];
    if (raw === undefined) return "";
    const lines = raw.split("\n");
    // Find common indentation from first non-empty line
    const firstLine = lines.find((l) => l.trim().length > 0);
    const commonIndent = firstLine ? firstLine.search(/\S/) : 0;
    return lines
      .map((l) => l.slice(commonIndent))
      .join("\n")
      .trim();
  }

  // Match inline description: "text" or description: text
  const inlineMatch = rawFrontmatter.match(
    /^description:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:[^\n]*?))\s*$/m,
  );
  if (inlineMatch) {
    const val = inlineMatch[1];
    if (val === undefined) return "";
    // Trim quotes if present
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      return val.slice(1, -1);
    }
    return val.trim();
  }

  return "";
}

// ── Reviewer metadata extraction ─────────────────────────────────────

export interface ReviewerMeta {
  name: string;
  path: string;
  description: string;
  category: string;
  triggers: { files: string[]; concerns: string[] };
  input_types: string[];
  primary_for: string[];
  always_with: string[];
}

function isStringArray(v: YamlValue): v is string[] {
  return (
    Array.isArray(v) &&
    v.every((item): item is string => typeof item === "string")
  );
}

function normalizeStrArray(v: YamlValue | undefined): string[] {
  if (v === undefined || v === null) return [];
  if (isStringArray(v)) return v;
  if (isYamlObject(v) && Object.keys(v).length === 0) return [];
  if (typeof v === "string") return [v];
  return [];
}

/**
 * Parse a SKILL.md file content and extract reviewer metadata.
 * Returns null if the file doesn't have opus sub-reviewer metadata.
 */
export function extractReviewerMeta(
  content: string,
  skillDir: string,
): ReviewerMeta | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  // Extract description directly from raw frontmatter to handle block scalars
  const rawFm = content.match(/^---\n([\s\S]*?)\n---/);
  const description = rawFm ? extractDescription(rawFm[1] ?? "") : "";

  const metadata = yGet(parsed, "metadata");
  const opus = isYamlObject(metadata) ? yGet(metadata, "opus") : undefined;
  if (!isYamlObject(opus)) return null;

  const role = yGet(opus, "role");
  if (role !== "sub-reviewer") return null;

  const reviewer = yGet(opus, "reviewer");
  // reviewer is optional — defaults to empty object
  const revObj = isYamlObject(reviewer) ? reviewer : {};

  const triggers = yGet(revObj, "triggers");
  const trigObj = isYamlObject(triggers) ? triggers : undefined;

  const name = yGet(parsed, "name");

  return {
    name: typeof name === "string" ? name : skillDir,
    path: `skills/${skillDir}/SKILL.md`,
    description,
    category: (() => {
      const c = yGet(revObj, "category");
      return typeof c === "string" ? c : "";
    })(),
    triggers: {
      files: normalizeStrArray(trigObj ? yGet(trigObj, "files") : undefined),
      concerns: normalizeStrArray(
        trigObj ? yGet(trigObj, "concerns") : undefined,
      ),
    },
    input_types: normalizeStrArray(yGet(revObj, "input_types")),
    primary_for: normalizeStrArray(yGet(revObj, "primary_for")),
    always_with: normalizeStrArray(yGet(revObj, "always_with")),
  };
}

// ── Table generators ──────────────────────────────────────────────

interface ManualEntry {
  name: string;
  invokes: string;
}

export const MANUAL_ENTRIES: ManualEntry[] = [
  {
    name: "opus-architect",
    invokes:
      "Architecture patterns, layering, DDD boundaries, domain purity, dependency direction, ADO anti-corruption, port interfaces, placement",
  },
  {
    name: "opus-ui-enforcer",
    invokes:
      "React components, MUI/Tailwind boundary, design tokens, component reuse, CSS compliance",
  },
  {
    name: "opus-analyse",
    invokes:
      "Full codebase reviews, pre-flight audits, dead code, duplication, overengineering",
  },
  {
    name: "opus-typescript",
    invokes:
      "TypeScript strictness, generics, type system, `as any`, `@ts-ignore`, strict flags",
  },
  {
    name: "performance-investigation",
    invokes:
      "Slow responses, memory/CPU issues, latency, throughput, profiling targets",
  },
];

export function generateScopeTable(reviewers: ReviewerMeta[]): string {
  const rows: string[] = [];

  // Build reverse map: primary-name → sub-reviewers that list it as primary_for.
  //
  // NOTE: `always_with` is no longer consumed here. Adjacent agent delegation
  // is now encoded in each skill's workflow text under `## Adjacent Agent
  // Delegation`. The orchestrator (opus-reviewer) reads each skill's SKILL.md
  // and aggregates those lists when dispatching.
  const companions = new Map<string, string[]>();
  for (const r of reviewers) {
    for (const pf of r.primary_for) {
      const list = companions.get(pf);
      if (list) list.push(r.name);
      else companions.set(pf, [r.name]);
    }
  }

  // Set of known reviewer names — used to filter out primary_for entries
  // that point to another reviewer (not an artefact type)
  const reviewerNames = new Set(reviewers.map((r) => r.name));

  const primaries = reviewers.filter((r) => r.primary_for.length > 0);

  for (const r of primaries) {
    for (const pf of r.primary_for) {
      // Skip primary_for entries that are other reviewer names —
      // they are already handled as companions via the reverse map
      if (reviewerNames.has(pf)) continue;

      // Collect also-list: reverse-mapped companions that list this primary
      // as their primary_for (excluding the primary itself to avoid self-reference)
      const alsoNames = new Set<string>();
      const comp = companions.get(r.name);
      if (comp) {
        for (const c of comp) {
          if (c !== r.name) alsoNames.add(c);
        }
      }
      const also =
        alsoNames.size > 0
          ? Array.from(alsoNames)
              .map((a) => `\`${a}\``)
              .join(", ")
          : "—";
      rows.push(
        `| ${pf.charAt(0).toUpperCase() + pf.slice(1).replace(/-/g, " ")} | \`${r.name}\` | ${also} |`,
      );
    }
  }

  if (rows.length === 0) return "| *No primaries defined* | — | — |";

  return [
    "| Input | Primary Specialist | Always Also |",
    "|-------|-------------------|-------------|",
    ...rows,
  ].join("\n");
}

export function generateSpecialistMap(reviewers: ReviewerMeta[]): string {
  const rows: string[] = [];

  // Manual entries first
  for (const m of MANUAL_ENTRIES) {
    rows.push(`| \`${m.name}\` | ${m.invokes} | — |`);
  }

  // Sub-reviewer entries (auto-generated)
  for (const r of reviewers) {
    const triggers = [
      ...r.triggers.concerns.map((c) => c),
      ...r.triggers.files.map((f) => f),
    ];
    const when =
      triggers.length > 0 ? triggers.join(", ") : r.description.slice(0, 120);

    rows.push(`| \`${r.name}\` | ${when} | \`read ${r.path}\` |`);
  }

  // Self row last
  rows.push(
    "| Self (opus-reviewer core) | Always — orchestration, synthesis, final verdict, verify pass | — |",
  );

  return [
    "| Skill | Invokes When | Load Path |",
    "|-------|-------------|-----------|",
    ...rows,
  ].join("\n");
}
