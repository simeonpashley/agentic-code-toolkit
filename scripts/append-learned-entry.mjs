import { appendFileSync } from "node:fs";

const BLOCKER_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(:[a-z0-9-]+)?$/;

function assertNonEmpty(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field}: must be non-empty string`);
  }
}

function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("entry must be an object");
  }

  const e = entry;

  // Required fields
  assertNonEmpty(e.goal, "goal");
  assertNonEmpty(e.evidence, "evidence");
  assertNonEmpty(e.artifact, "artifact");
  assertNonEmpty(e.guardrail, "guardrail");
  assertNonEmpty(e.ts, "ts");

  // verdict
  if (!["pass", "fail", "partial"].includes(e.verdict)) {
    throw new Error("verdict: must be pass, fail, or partial");
  }

  // blocker (optional, but if present must be kebab-case)
  if (e.blocker !== undefined) {
    assertNonEmpty(e.blocker, "blocker");
    if (!BLOCKER_RE.test(e.blocker)) {
      throw new Error("blocker: must be kebab-case");
    }
    if (/\bado\b/.test(e.blocker)) {
      throw new Error("blocker: must use azure-devops not ado");
    }
  }

  // timestamp
  if (!e.ts.endsWith("Z") || Number.isNaN(Date.parse(e.ts))) {
    throw new Error("ts: must be ISO8601 UTC ending with Z");
  }

  // attempts (optional, but if present must be non-empty array of non-empty strings)
  if (e.attempts !== undefined) {
    if (!Array.isArray(e.attempts) || e.attempts.length === 0) {
      throw new Error("attempts: must be a non-empty array");
    }
    for (const attempt of e.attempts) {
      assertNonEmpty(attempt, "attempts");
    }
  }

  // examination (optional, must be E, P, or M)
  if (e.examination !== undefined && !["E", "P", "M"].includes(e.examination)) {
    throw new Error("examination: must be E, P, or M if provided");
  }

  // tags (optional)
  if (e.tags !== undefined) {
    if (!Array.isArray(e.tags)) {
      throw new Error("tags: must be an array when provided");
    }
    for (const tag of e.tags) {
      assertNonEmpty(tag, "tags");
      if (!TAG_RE.test(tag)) {
        throw new Error("tags: must use lowercase");
      }
    }
  }
}

const raw = process.argv[2];

if (!raw) {
  console.error("usage: node scripts/append-learned-entry.mjs '<JSON entry>'");
  process.exit(1);
}

let parsed;

try {
  parsed = JSON.parse(raw);
} catch {
  console.error("append-learned-entry: invalid JSON");
  process.exit(1);
}

try {
  validateEntry(parsed);
} catch (err) {
  console.error(`append-learned-entry: ${err.message}`);
  process.exit(1);
}

const canonical = JSON.stringify(parsed);
appendFileSync("learned.md", `${canonical}\n`, { encoding: "utf8", flag: "a" });
