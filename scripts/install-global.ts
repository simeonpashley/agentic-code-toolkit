#!/usr/bin/env npx tsx
/**
 * Install global agentic-code-toolkit config into ~/.pi/agent/ and ~/.agents/skills/.
 *
 * Creates dev symlinks (replaces symlink-global.sh), copies non-symlinked
 * files, rsyncs non-symlinked directories, runs pnpm install, and audits
 * the dest for unmanaged residue (blocklist → report).
 */

import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import {
  applyOverride,
  parseSettingsJson,
  deepEqual,
  findSpec,
  type Json,
} from "./settings-merge";

const KIT = join(new URL("..", import.meta.url).pathname);
const PI_AGENT = process.env.PI_AGENT || join(homedir(), ".pi", "agent");
const AGENTS_HOME = process.env.AGENTS_HOME || join(homedir(), ".agents");
const AGENTS_SKILLS = join(AGENTS_HOME, "skills");
const CONFIG = join(KIT, "scripts", "install-dest-config.json");

// ── Expected paths ────────────────────────────────────────────────────
const expected = new Set<string>();
function registerDest(path: string) {
  expected.add(path);
}

// ── Config ────────────────────────────────────────────────────────────
interface InstallConfig {
  system: string[];
  blocklist: string[];
}
function loadConfig(): InstallConfig {
  try {
    return JSON.parse(readFileSync(CONFIG, "utf-8")) as InstallConfig;
  } catch {
    return { system: [], blocklist: [] };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function matches(entry: string, rel: string): boolean {
  if (entry.endsWith("/")) {
    const dir = entry.replace(/\/+$/, "");
    return (rel + "/").startsWith(dir + "/");
  }
  return rel === entry;
}

// ── Symlinks (replaces symlink-global.sh) ──────────────────────────

function stamp(): string {
  const n = new Date();
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}${String(n.getHours()).padStart(2, "0")}${String(n.getMinutes()).padStart(2, "0")}${String(n.getSeconds()).padStart(2, "0")}`;
}

/**
 * Create a symlink from dst → src for a directory. If dst exists as a real
 * directory (not a symlink), back it up to dst.backup.<timestamp> first.
 */
function ensureSymlinkDir(src: string, dst: string) {
  if (!existsSync(src)) return;

  try {
    if (lstatSync(dst).isSymbolicLink()) {
      // Already symlinked; ensure it points to the right place
      const target = readlinkSync(dst);
      if (target !== src) {
        unlinkSync(dst);
        symlinkSync(src, dst);
      }
      // Register (whether newly created or already correct)
      const srcFiles = findRecursive(src);
      for (const f of srcFiles) registerDest(join(dst, relative(src, f)));
      return;
    } else if (existsSync(dst)) {
      // Real directory — back it up
      const backup = `${dst}.backup.${stamp()}`;
      renameSync(dst, backup);
      console.log(`  Backed up ${dst} → ${backup}`);
    }
  } catch {
    /* dst doesn't exist */
  }

  symlinkSync(src, dst);

  // Register all files under the symlink path as expected
  const srcFiles = findRecursive(src);
  for (const f of srcFiles) registerDest(join(dst, relative(src, f)));
}

/** Create a symlink from dst → src for a file. Removes existing dst. */
function ensureSymlinkFile(src: string, dst: string) {
  if (!existsSync(src)) return;
  try {
    unlinkSync(dst);
  } catch {
    // File may not exist — safe to ignore
  }
  symlinkSync(src, dst);
  registerDest(dst);
}

// ── Copy / Sync ───────────────────────────────────────────────────────
function copyFile(src: string, dst: string) {
  if (!existsSync(src)) return;
  mkdirSync(join(dst, ".."), { recursive: true });
  cpSync(src, dst, { preserveTimestamps: true });
  registerDest(dst);
}

function findRecursive(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    results.push(dir);
    for (const d of entries) {
      const full = join(dir, d.name);
      results.push(full);
      if (d.isDirectory()) results.push(...findRecursive(full));
    }
  } catch {
    /* permission error */
  }
  return results;
}

function syncDir(src: string, dst: string, extraExcludes: string[] = []) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });

  const excludes = [
    "'*DISABLED*'",
    "'tests/'",
    "'__tests__/'",
    "'*.test.ts'",
    "'*.spec.ts'",
    "'vitest*'",
    ...extraExcludes,
  ]
    .map((e) => `--exclude=${e}`)
    .join(" ");

  try {
    execSync(`rsync -a --delete-excluded ${excludes} "${src}/" "${dst}/"`, {
      stdio: "inherit",
    });
  } catch {
    /* rsync may exit 1 on non-fatal warnings */
  }

  // Register source paths as expected dest paths
  const srcFiles = findRecursive(src);
  for (const f of srcFiles) registerDest(join(dst, relative(src, f)));
}

// ── Audit ─────────────────────────────────────────────────────────────
async function auditDestOnly() {
  const { system, blocklist } = loadConfig();
  const removed: string[] = [];
  const unknown: string[] = [];
  const skillsFiles: string[] = [];

  async function walk(dir: string) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === "node_modules") continue;
      const full = join(dir, name);
      const rel = relative(PI_AGENT, full);
      const dirFlag = isDir(full);

      if (expected.has(full)) {
        if (dirFlag) await walk(full);
        continue;
      }

      if (
        !dirFlag &&
        [
          "package-lock.json",
          "yarn.lock",
          "bun.lockb",
          "pnpm-lock.yaml",
        ].includes(name)
      )
        continue;

      if (dirFlag) {
        if (system.some((e) => matches(e, rel))) continue;
        if (blocklist.some((e) => matches(e, rel))) {
          await rm(full, { recursive: true, force: true });
          removed.push(rel);
          continue;
        }
        await walk(full);
      } else {
        if (system.some((e) => matches(e, rel))) continue;
        if (blocklist.some((e) => matches(e, rel))) {
          await rm(full, { force: true });
          removed.push(rel);
          continue;
        }
        if (rel.startsWith("skills/")) {
          skillsFiles.push(rel);
        } else {
          unknown.push(rel);
        }
      }
    }
  }

  await walk(PI_AGENT);

  if (removed.length) {
    console.log("\nRemoved blocklisted dest-only files:");
    for (const f of removed) console.log(`  ${f}`);
  }
  if (unknown.length) {
    console.log("\nWARNING: dest-only files not in source or allowlist:");
    for (const f of unknown) console.log(`  ${f}`);
    console.log(
      "\n  Add to scripts/install-dest-config.json (allow) or blocklist.",
    );
  }
  if (skillsFiles.length) {
    console.log("\nUnmanaged skills in ~/.pi/agent/skills/:");
    for (const f of skillsFiles) console.log(`  ${f}`);
    console.log("  Consider moving to ~/.agents/skills/ (canonical home).");
  }
}

// ── Main ─────────────────────────────────────────────────────────────

/**
 * Walk the override object and emit every dotted path the user
 * explicitly set. Used to distinguish "live key matched by override"
 * (no drift) from "live key never touched by override" (real drift).
 */
function collectOverridePaths(obj: Record<string, Json>): Set<string> {
  const out = new Set<string>();
  walkOverridePaths(obj, "", out);
  return out;
}

function walkOverridePaths(
  obj: Record<string, Json>,
  prefix: string,
  out: Set<string>,
): void {
  for (const [k, v] of Object.entries(obj)) {
    const dotted = prefix ? `${prefix}.${k}` : k;
    out.add(dotted);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      walkOverridePaths(v, dotted, out);
    }
  }
}

/**
 * Read a dotted-path value out of a JSON object. Returns `undefined`
 * when any segment along the path is missing.
 */
function readLiveValueAtPath(
  obj: Record<string, Json>,
  dotted: string,
): Json | undefined {
  const segs = dotted.split(".");
  let cur: Json | undefined = obj;
  for (const s of segs) {
    if (
      cur === undefined ||
      typeof cur !== "object" ||
      cur === null ||
      Array.isArray(cur)
    )
      return undefined;
    cur = (cur as Record<string, Json>)[s];
  }
  return cur;
}

async function main() {
  mkdirSync(PI_AGENT, { recursive: true });
  mkdirSync(AGENTS_SKILLS, { recursive: true });

  // ── Symlinks (dev workflow — replaces symlink-global.sh) ──
  ensureSymlinkDir(join(KIT, "prompts"), join(PI_AGENT, "prompts"));
  ensureSymlinkDir(join(KIT, "extensions"), join(PI_AGENT, "extensions"));
  ensureSymlinkDir(join(KIT, "agent", "agents"), join(PI_AGENT, "agents"));
  // Long-form content docs (e.g. sanity-gates.md). These are referenced by
  // absolute install path (`~/.pi/agent/docs/...`) from skill bodies and
  // by sibling-relative URL from AGENTS.md (sitting next to docs/).
  ensureSymlinkDir(join(KIT, "agent", "docs"), join(PI_AGENT, "docs"));
  ensureSymlinkFile(
    join(KIT, "agent", "AGENTS.md"),
    join(PI_AGENT, "AGENTS.md"),
  );
  ensureSymlinkFile(
    join(KIT, "agent", "APPEND_SYSTEM.md"),
    join(PI_AGENT, "APPEND_SYSTEM.md"),
  );

  // Remove old pi skills symlink (skills now live at ~/.agents/skills/ only)
  try {
    const ps = join(PI_AGENT, "skills");
    if (lstatSync(ps).isSymbolicLink()) unlinkSync(ps);
  } catch {
    // Symlink may not exist — safe to ignore
  }

  // ── Copies (non-symlinked files) ──
  copyFile(join(KIT, "package.json"), join(PI_AGENT, "package.json"));
  copyFile(join(KIT, "pnpm-lock.yaml"), join(PI_AGENT, "pnpm-lock.yaml"));
  copyFile(
    join(KIT, "pnpm-workspace.yaml"),
    join(PI_AGENT, "pnpm-workspace.yaml"),
  );

  // ── Apply per-key settings overrides (agent/settings-overrides.json) ──
  // Deep-merges only the keys in the override into ~/.pi/agent/settings.json;
  // any other keys (theme, defaultProvider, packages, runtime state) survive
  // untouched. See scripts/settings-merge.ts for the contract.
  const overridesPath = join(KIT, "agent", "settings-overrides.json");
  const liveSettingsPath = join(PI_AGENT, "settings.json");
  if (existsSync(overridesPath)) {
    let overrideDoc: Record<string, Json>;
    try {
      overrideDoc = parseSettingsJson(readFileSync(overridesPath, "utf-8"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`
ERROR: ${overridesPath} is not valid JSON: ${msg}`);
      console.error(
        "Refusing to apply partial settings changes. Fix the file and rerun.",
      );
      process.exit(1);
    }

    let liveDoc: Record<string, Json> = {};
    let liveOk = true;
    if (existsSync(liveSettingsPath)) {
      try {
        liveDoc = parseSettingsJson(readFileSync(liveSettingsPath, "utf-8"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`
ERROR: ${liveSettingsPath} is not valid JSON: ${msg}`);
        console.error(
          "Refusing to overwrite a malformed settings file. Fix it manually and rerun.",
        );
        liveOk = false;
      }
    }

    if (liveOk) {
      const { result } = applyOverride(liveDoc, overrideDoc);

      // Write the merge back only if values actually changed. Comparing the
      // serialized form is unsafe (default JSON.stringify reformatting
      // arrays and whitespace) — compare parseable JSON to detect semantic
      // changes only.
      let semanticChanged = false;
      if (existsSync(liveSettingsPath)) {
        let currentParsed: Record<string, Json>;
        try {
          currentParsed = parseSettingsJson(
            readFileSync(liveSettingsPath, "utf-8"),
          );
        } catch {
          currentParsed = {};
        }
        semanticChanged = !deepEqual(currentParsed, result.merged);
      } else {
        semanticChanged = true;
      }
      if (semanticChanged) {
        // Always pretty-print with 2-space indent + trailing newline (matches
        // what pi writes itself).
        await writeFile(
          liveSettingsPath,
          JSON.stringify(result.merged, null, 2) + "\n",
          "utf-8",
        );
      }

      // Report.
      console.log("\nApplied settings overrides:");
      if (result.appliedKeys.length === 0) {
        console.log("  (none — override matches live file)");
      } else {
        for (const k of result.appliedKeys) console.log(`  + ${k}`);
      }
      if (result.defaultStrippedKeys.length > 0) {
        console.log(
          "\nOverride keys dropped because they match pi's runtime default:",
        );
        for (const k of result.defaultStrippedKeys) console.log(`  ~ ${k}`);
      }
      if (result.ignoredKeys.length > 0) {
        console.log("\nIgnored override keys (unusual values; skipped):");
        for (const k of result.ignoredKeys) console.log(`  - ${k}`);
      }
      // Classify the live keys the override doesn't touch. Keys that
      // equal pi's runtime default are inherited (not drift) — adding
      // them to the override file would be a no-op. Keys whose value
      // differs from the default are real drift: the user (or a prior
      // process) explicitly chose a non-default.
      const overridePaths = collectOverridePaths(overrideDoc);
      const liveOnlyPaths = result.untouchedKeys.filter(
        (dotted) => !overridePaths.has(dotted),
      );
      if (liveOnlyPaths.length > 0) {
        const matchesDefault: string[] = [];
        const driftsFromDefault: string[] = [];
        for (const dotted of liveOnlyPaths) {
          const spec = findSpec(dotted);
          const liveValue = readLiveValueAtPath(liveDoc, dotted);
          // A key in the live file with no current value AND no spec
          // is treated as drift (there's nothing tying it down).
          // A key with a known spec whose live value equals the
          // default is "inherited", not drift.
          if (spec === undefined) {
            driftsFromDefault.push(dotted);
            continue;
          }
          // spec.default may be undefined (e.g. defaultThinkingLevel)
          // — treat undefined === undefined as "matches" so the key
          // is reported as inherited, not as unconfigured drift.
          const liveIsDefault =
            liveValue === undefined && spec.default === undefined;
          if (liveIsDefault || deepEqual(liveValue as Json, spec.default)) {
            matchesDefault.push(dotted);
          } else {
            driftsFromDefault.push(dotted);
          }
        }

        if (driftsFromDefault.length > 0) {
          const roots = [
            ...new Set(driftsFromDefault.map((k) => k.split(".")[0]!)),
          ].sort();
          console.log(
            "\nDrift -- top-level keys in ~/.pi/agent/settings.json with non-default values:",
          );
          for (const k of roots) console.log(`  drift: ${k}`);
        }

        if (matchesDefault.length > 0) {
          // Use 'inherited' rather than 'unmanaged' for this list --
          // these keys ARE managed (by pi's defaults), we just don't
          // ship them in the override file.
          const roots = [
            ...new Set(matchesDefault.map((k) => k.split(".")[0]!)),
          ].sort();
          console.log(
            "\nInherited defaults -- top-level keys where the live value equals pi's runtime default (override file ships no opinion):",
          );
          for (const k of roots) console.log(`  inherited: ${k}`);
        }
      }
    }
  }

  // ── Pre-flight: update reviewer metadata & dispatch tables ──
  console.log("\nUpdating reviewer metadata...");
  execSync(`npx tsx "${join(KIT, "scripts", "add-reviewer-metadata.ts")}"`, {
    stdio: "inherit",
    cwd: KIT,
  });
  console.log("Generating reviewer dispatch tables...");
  execSync(
    `npx tsx "${join(KIT, "scripts", "generate-reviewer-dispatch.ts")}"`,
    { stdio: "inherit", cwd: KIT },
  );

  // Format generated content so install doesn't leave a dirty working tree
  console.log("Formatting generated skill content...");
  execSync(
    `npx prettier --write --no-color --log-level silent "${join(KIT, "skills")}"`,
    {
      stdio: "inherit",
      cwd: KIT,
    },
  );

  // ── Rsync (original behavior: always runs, follows symlinks) ──
  syncDir(join(KIT, "prompts"), join(PI_AGENT, "prompts"));
  syncDir(join(KIT, "extensions"), join(PI_AGENT, "extensions"));
  syncDir(join(KIT, "skills"), AGENTS_SKILLS);
  syncDir(join(KIT, "scripts"), join(PI_AGENT, "scripts"), [
    "'install-*'",
    "'*.test.*'",
    "'install-dest-config.json'",
  ]);

  // ── Pre-install cleanup: remove blocklisted files ──
  // Run before pnpm install so stale workspace configs don't break the install.
  const { blocklist: preBlocklist } = loadConfig();
  for (const entry of preBlocklist) {
    const target = join(PI_AGENT, entry);
    try {
      rmSync(target, { recursive: true, force: true });
    } catch {
      /* may not exist */
    }
  }
  if (existsSync(join(PI_AGENT, "pnpm-lock.yaml"))) {
    execSync("pnpm install --prod", { cwd: PI_AGENT, stdio: "inherit" });
  } else if (existsSync(join(PI_AGENT, "package.json"))) {
    execSync("pnpm install --prod", { cwd: PI_AGENT, stdio: "inherit" });
  }

  await auditDestOnly();

  console.log(`\nInstalled Pi config into: ${PI_AGENT}`);
  console.log(`Installed cross-harness skills into: ${AGENTS_SKILLS}`);

  // ── Recommended CLI tools ──
  console.log(`\n── Recommended CLI tools ──`);
  console.log(`These tools improve terminal workflows when using pi:`);
  console.log(`  rg   burntsushi/ripgrep    — ultra-fast recursive grep`);
  console.log(`  rtk  phiresky/ripgrep-tk  — interactive TUI for ripgrep`);
  console.log(
    `  rga  phiresky/ripgrep-all  — ripgrep in PDF, docx, ebooks, etc.`,
  );
  console.log(
    `  fd   sharkdp/fd            — fast file finder (find replacement)`,
  );
  console.log(
    `  fzf  junegunn/fzf           — fuzzy finder (fuzzy search history, files)`,
  );
  console.log(
    `  bat  sharkdp/bat            — cat with syntax highlighting & git gutter`,
  );
  console.log(`  eza  eza-community/eza     — modern ls with icons, tree view`);
  console.log(`  jq   jqlang/jq              — JSON CLI processor`);
  console.log(
    `  zoxide  ajeetdsouza/zoxide  — smarter cd (jump to frecent dirs)`,
  );
  console.log(``);
  console.log(
    `Install via Homebrew: brew install ripgrep ripgrep-all fd fzf bat eza jq zoxide`,
  );
  console.log(`Ripgrep-tk via:    brew install rtk`);
  console.log(``);
  console.log(
    `On Windows: use WSL2 with a Linux distro (Ubuntu/Debian) for full tooling support.`,
  );
  console.log(
    `The native Windows ecosystem lacks most of these tools; WSL is the recommended path.`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Install failed:", message);
  process.exit(1);
});
