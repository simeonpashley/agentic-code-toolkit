import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const SKILLS_DIR = join(import.meta.dirname, "..", "skills");

// ── Spec constants (agentskills.io/specification) ──────────────────
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;
const VALID_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // lowercase, hyphens, no consecutive/leading/trailing

/** Extract YAML frontmatter text between first and second --- fences. */
function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1]! : null;
}

/** Find all SKILL.md files under skills/, recursively. */
function findSkillFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") {
      results.push(full);
    } else if (entry.isDirectory()) {
      results.push(...findSkillFiles(full));
    }
  }
  return results;
}

/**
 * Detect duplicate YAML keys by parsing indentation-aware key paths.
 * Tracks key nesting via indentation, flags any key repeated at same level
 * under same parent.
 */
function findDuplicateKeys(yaml: string): string[] {
  const lines = yaml.split("\n");
  const issues: string[] = [];
  const stack: { indent: number; keys: Set<string> }[] = [
    { indent: -1, keys: new Set() },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const leading = line.length - line.trimStart().length;
    if (line.trimStart().startsWith("- ")) continue;

    const m = line.match(/^(\s*)([^\s#][^:#]*?):(\s|$)/);
    if (!m) continue;

    const key = m[2]!;
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= leading) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]!;

    if (parent.keys.has(key)) {
      const parentPath = stack
        .slice(1)
        .map((s) => Array.from(s.keys).pop() ?? "?")
        .join(".");
      const full = parentPath ? `${parentPath}.${key}` : key;
      issues.push(`line ${i + 1}: duplicate key "${full}"`);
    } else {
      parent.keys.add(key);
    }

    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1]!;
      const nextLeading = nextLine.length - nextLine.trimStart().length;
      if (nextLeading > leading) {
        stack.push({ indent: leading, keys: new Set() });
      }
    }
  }
  return issues;
}

/**
 * Parse YAML frontmatter into a flat key-value map, extracting only simple
 * scalar values. Handles block scalars (|, >), flow scalars, and inline values.
 * For nested mappings, stores the raw indented block as a string value.
 */
function parseFrontmatterSimple(fm: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = fm.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Top-level key detection (indent 0)
    if (
      indent === 0 &&
      trimmed &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("- ")
    ) {
      const m = trimmed.match(/^([^\s#][^:#]*?):(\s|$)/);
      if (m) {
        const key = m[1]!;
        const rest = trimmed.slice(m[0].length);

        if (rest.trim() === "" || rest.trim() === "|" || rest.trim() === ">") {
          // Block scalar or nested mapping — gather indented lines
          const blockLines: string[] = [];
          let j = i + 1;
          while (
            j < lines.length &&
            (lines[j] === "" ||
              lines[j]!.length - lines[j]!.trimStart().length > indent)
          ) {
            blockLines.push(lines[j]!);
            j++;
          }
          result[key] = blockLines.join("\n").trim();
          i = j;
          continue;
        } else {
          // Inline scalar value
          result[key] = rest.trim();
        }
      }
    }
    i++;
  }

  return result;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("skill frontmatter validation (agentskills.io spec)", () => {
  const skillFiles = findSkillFiles(SKILLS_DIR);

  it("has skill files to validate", () => {
    expect(skillFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of skillFiles) {
    const rel = filePath.replace(SKILLS_DIR + "/", "");
    const dirName = basename(join(filePath, ".."));

    it(`YAML is well-formed (no duplicate keys): ${rel}`, () => {
      const content = readFileSync(filePath, "utf-8");
      const fm = extractFrontmatter(content);
      expect(fm, `Missing YAML frontmatter in ${rel}`).not.toBeNull();

      const dupes = findDuplicateKeys(fm!);
      if (dupes.length > 0) {
        expect.fail(
          `Duplicate YAML keys in ${rel}:\n    ${dupes.join("\n    ")}`,
        );
      }
    });

    it(`required field 'name' is valid: ${rel}`, () => {
      const content = readFileSync(filePath, "utf-8");
      const fm = extractFrontmatter(content);
      if (!fm) return;

      const parsed = parseFrontmatterSimple(fm);

      // name is required per spec
      expect(
        parsed.name,
        `Missing required field 'name' in ${rel}`,
      ).toBeDefined();
      const name = parsed.name!;

      // Must be 1-64 characters
      expect(
        name.length,
        `name too long (${name.length}>${MAX_NAME_LENGTH}) in ${rel}`,
      ).toBeLessThanOrEqual(MAX_NAME_LENGTH);
      expect(name.length, `name empty in ${rel}`).toBeGreaterThan(0);

      // Must be lowercase letters, numbers, hyphens; no consecutive/leading/trailing hyphens
      expect(
        name,
        `name "${name}" must be lowercase letters/numbers/hyphens only: ${rel}`,
      ).toMatch(VALID_NAME_RE);

      // Must match directory name exactly per spec
      expect(
        name,
        `name "${name}" must match directory "${dirName}": ${rel}`,
      ).toBe(dirName);
    });

    it(`required field 'description' is valid: ${rel}`, () => {
      const content = readFileSync(filePath, "utf-8");
      const fm = extractFrontmatter(content);
      if (!fm) return;

      const parsed = parseFrontmatterSimple(fm);

      expect(
        parsed.description,
        `Missing required field 'description' in ${rel}`,
      ).toBeDefined();
      const desc = parsed.description!;

      expect(desc.length, `description empty in ${rel}`).toBeGreaterThan(0);
      expect(
        desc.length,
        `description too long (${desc.length}>${MAX_DESCRIPTION_LENGTH}) in ${rel}`,
      ).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    });

    it(`optional spec fields are well-formed if present: ${rel}`, () => {
      const content = readFileSync(filePath, "utf-8");
      const fm = extractFrontmatter(content);
      if (!fm) return;

      const parsed = parseFrontmatterSimple(fm);

      // compatibility: 1-500 chars
      if (parsed.compatibility !== undefined) {
        expect(
          typeof parsed.compatibility,
          `compatibility must be string in ${rel}`,
        ).toBe("string");
        expect(
          parsed.compatibility.length,
          `compatibility too long (${parsed.compatibility.length}>${MAX_COMPATIBILITY_LENGTH}) in ${rel}`,
        ).toBeLessThanOrEqual(MAX_COMPATIBILITY_LENGTH);
        expect(
          parsed.compatibility.length,
          `compatibility empty in ${rel}`,
        ).toBeGreaterThan(0);
      }

      // license: string
      if (parsed.license !== undefined) {
        expect(typeof parsed.license, `license must be string in ${rel}`).toBe(
          "string",
        );
        expect(
          parsed.license.length,
          `license empty in ${rel}`,
        ).toBeGreaterThan(0);
      }

      // allowed-tools: string (experimental)
      if (parsed["allowed-tools"] !== undefined) {
        expect(
          typeof parsed["allowed-tools"],
          `allowed-tools must be string in ${rel}`,
        ).toBe("string");
      }
    });

    it(`metadata block is a mapping (not a scalar): ${rel}`, () => {
      const content = readFileSync(filePath, "utf-8");
      const fm = extractFrontmatter(content);
      if (!fm) return;

      // If metadata exists at top level, it must be a mapping
      const metaRe = /^metadata:(\s)(\S)/m;
      const scalarMeta = fm.match(metaRe);
      if (scalarMeta) {
        // metadata: followed by non-whitespace on same line = scalar value
        expect.fail(
          `'metadata' in ${rel} must be a mapping (object), got scalar: "metadata:${scalarMeta[1]}${scalarMeta[2]}..."`,
        );
      }
    });
  }
});
