/**
 * Confirm destructive tool calls before they run.
 *
 * Original - https://github.com/spences10/my-pi/tree/main/packages/pi-confirm-destructive
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
  ToolResultEvent,
  UserBashEvent,
  UserBashEventResult,
} from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

export interface DestructiveAction {
  title: string;
  description: string;
  reason: string;
  allow_key: string;
}

interface DestructiveCommandPattern {
  pattern: RegExp;
  reason: string;
  allow_key: string;
}

const DESTRUCTIVE_COMMAND_PATTERNS: DestructiveCommandPattern[] = [
  {
    pattern:
      /(^|[;&|]\s*)(npx\s+|pnpx\s+|pnpm\s+exec\s+|bunx\s+)?prisma\s+(migrate\s+reset|db\s+push\b[^;&|]*--force-reset|db\s+execute\b)/,
    reason: "Runs a potentially destructive Prisma database operation",
    allow_key: "bash:prisma-destructive",
  },
  {
    pattern:
      /(^|[;&|]\s*)(psql|mysql|mariadb|sqlite3)\b[^;&|]*\b(drop|delete\s+from|truncate|alter\s+table|update\s+\S+\s+set)\b/i,
    reason: "Runs destructive SQL through a database CLI",
    allow_key: "bash:db-cli-destructive-sql",
  },
  {
    pattern: /(^|[;&|]\s*)find\b[^;&|]*(\s-delete\b|-exec\s+(sudo\s+)?rm\b)/,
    reason: "Deletes files found by find",
    allow_key: "bash:find-delete",
  },
  {
    pattern: /(^|[;&|]\s*)git\s+clean\b[^;&|]*-[a-zA-Z]*[fdx][a-zA-Z]*/,
    reason: "Deletes untracked files or directories",
    allow_key: "bash:git-clean",
  },
  {
    pattern:
      /(^|[;&|]\s*)git\s+(checkout|restore)\b[^;&|]*(\s--\s+\.\s*$|\s\.\s*$)/,
    reason: "Discards working tree changes",
    allow_key: "bash:git-discard-all",
  },
  {
    pattern: /(^|[;&|]\s*)rsync\b[^;&|]*\s--delete\b/,
    reason: "Deletes destination files during sync",
    allow_key: "bash:rsync-delete",
  },
  {
    pattern: /(^|[;&|]\s*)truncate\b[^;&|]*(\s-s\s*0\b|\s--size\s*=?\s*0\b)/,
    reason: "Empties file contents",
    allow_key: "bash:truncate-zero",
  },
  {
    pattern: /(^|[;&|]\s*)dd\b[^;&|]*\bof=/,
    reason: "Overwrites a device or file with dd",
    allow_key: "bash:dd-output",
  },
  {
    pattern: /(^|[\s;&|]\s*)(mkfs|fdisk|parted|wipefs)\b/,
    reason: "Modifies disks or filesystems",
    allow_key: "bash:disk-tool",
  },
  // ── git stash drop / clear ──────────────────────────────────────────
  // Stashes are the last-resort recovery mechanism for uncommitted work.
  // An agent that pops a stash then runs `git stash drop` to "clean up"
  // the now-unreferenced entry silently destroys untracked work the user
  // may not have reviewed — the exact bug that produced this rule (see
  // AGENTS.md "Stashes must never be dropped without confirmation").
  // Distinct allow_keys per subcommand prevent a session-allow from
  // widening across `drop` and `clear`.
  {
    pattern: /(^|[\s;&|]\s*)git\s+stash\s+drop(\s+--all|\s+stash@\{\d+\})?\b/,
    reason:
      "Drops a git stash entry — uncommitted work cannot be recovered afterwards",
    allow_key: "bash:git-stash-drop",
  },
  // `git stash pop` itself is recoverable: on apply failure the entry
  // stays in the stack. But `--force` (or `-f`) silently discards the
  // entry even when the apply would have conflicted — the same hazard
  // as drop. Pin both flags under the same allow_key so session-cache
  // policy and audit trail are aligned.
  {
    pattern: /(^|[\s;&|]\s*)git\s+stash\s+pop(\s+--force|\s+-f)\b/,
    reason:
      "Force-applies a stash and discards the entry even on conflict — untracked work is unrecoverable",
    allow_key: "bash:git-stash-pop-force",
  },
  {
    pattern: /(^|[\s;&|]\s*)git\s+stash\s+clear\b/,
    reason: "Clears every git stash entry — all stashed work is unrecoverable",
    allow_key: "bash:git-stash-clear",
  },
];

/**
 * `allow_key` prefixes for which "Allow similar for this session" MUST
 * NOT be offered. These are destructive patterns where a single click
 * silently widening the policy to every future invocation is too dangerous
 * — see the symlink-loop and stash-drop incidents in MEMORY.
 *
 * Adding a new entry here: every entry MUST correspond to an entry in
 * DESTRUCTIVE_COMMAND_PATTERNS (or another assessor) whose
 * `allow_key` is captured here verbatim. The
 * `confirm-destructive-no-session-allow.test.ts` suite enforces this
 * by iterating over representative commands and asserting that each
 * resolved `allow_key` is in NO_SESSION_ALLOW_PREFIXES.
 */
const NO_SESSION_ALLOW_PREFIXES: readonly string[] = [
  // git stash — last-resort recovery for uncommitted work
  "bash:git-stash-drop",
  "bash:git-stash-clear",
  "bash:git-stash-pop-force",
  // git clean / rm / reset / restore — all discard working-tree state
  "bash:git-clean",
  "bash:git-rm-force",
  "bash:git-rm-risky",
  "bash:git-reset-hard",
  "bash:git-discard-all",
  // find / rsync with destructive side effects
  "bash:find-delete",
  "bash:rsync-delete",
  // file content destruction
  "bash:truncate-zero",
  // device overwrite
  "bash:dd-output",
  "bash:disk-tool",
  // database destruction — recoverable only from a backup
  "bash:prisma-destructive",
  "bash:db-cli-destructive-sql",
];

/**
 * Predicate: returns true if the given `allow_key` MUST NOT be cached for
 * the session. The UI layer uses this to drop the "Allow similar" option.
 *
 * Matching rule: exact equality OR prefix + ":" (so `bash:git-clean:foo`
 * is also blocked, but a key that just *contains* "bash:git-clean" is
 * not — that would be too greedy).
 */
export function is_session_allow_blocked(allow_key: string): boolean {
  return NO_SESSION_ALLOW_PREFIXES.some(
    (prefix) => allow_key === prefix || allow_key.startsWith(prefix + ":"),
  );
}

const DESTRUCTIVE_CUSTOM_TOOL_NAME =
  /(^|[_-])(delete|destroy|drop|remove|archive|execute_write_query|execute_schema_query|bulk_insert)([_-]|$)/i;

function preview(value: string, max = 500): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > max
    ? `${normalized.slice(0, max - 1)}…`
    : normalized;
}

function git(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function is_git_repo(cwd: string): boolean {
  return git(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
}

type GitRecoverability =
  "tracked-clean" | "tracked-dirty" | "untracked" | "not-git";

function get_git_recoverability(cwd: string, path: string): GitRecoverability {
  if (!is_git_repo(cwd)) return "not-git";

  const status = git(["status", "--porcelain=v1", "--", path], cwd);
  if (status === undefined) return "not-git";
  if (status.length > 0) {
    return status.split("\n").some((line) => line.startsWith("??"))
      ? "untracked"
      : "tracked-dirty";
  }

  const tracked = git(["ls-files", "--", path], cwd);
  return tracked ? "tracked-clean" : "untracked";
}

function is_git_recoverable(cwd: string, path: string): boolean {
  return get_git_recoverability(cwd, path) === "tracked-clean";
}

function is_path_within(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}

function is_agent_temp_path(path: string): boolean {
  const temp_root = resolve(tmpdir());
  const absolute = resolve(path);
  if (!is_path_within(temp_root, absolute)) return false;
  const first_segment = relative(temp_root, absolute).split(/[\\/]+/)[0] ?? "";
  return /^my-pi-(audit|sandbox|temp|tmp|work)-/.test(first_segment);
}

function is_todo_planning_note(path: string): boolean {
  return basename(path).toLowerCase() === "todo.md";
}

function parse_shell_words(command: string): string[] {
  const words: string[] = [];
  const pattern = /"((?:\\.|[^"])*)"|'([^']*)'|(\S+)/g;
  for (const match of command.matchAll(pattern)) {
    words.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return words;
}

function extract_command_paths(
  command: string,
  command_name: "rm" | "git-rm",
): string[] | undefined {
  if (/[;&|`$()<>]/.test(command)) return undefined;
  const words = parse_shell_words(command);
  const command_index =
    command_name === "rm"
      ? words.findIndex((word) =>
          ["rm", "rmdir", "unlink", "shred"].includes(word),
        )
      : words.findIndex(
          (word, index) => word === "rm" && words[index - 1] === "git",
        );
  if (command_index === -1) return undefined;

  return words
    .slice(command_index + 1)
    .filter((word) => word !== "--" && !word.startsWith("-"));
}

/**
 * Extract `ln` arguments from a bash command, tolerating compound
 * operators (`&&`, `||`, `;`, newline). The existing
 * `extract_command_paths` bails on shell metacharacters — that is the
 * gap that would have missed a destructive symlink incident, which chained the
 * bad `ln -sf` with `&&`.
 *
 * Returns `[src, linkname]` after stripping `-s`/`-f`/`-sf`/etc., or
 * `undefined` if `ln` isn't present, args can't be parsed, or a
 * `-t DIR` form is used without enough info.
 */
function extract_ln_args(command: string): [string, string] | undefined {
  if (!/(^|[^A-Za-z0-9_])(?:sudo\s+)?ln\s/.test(command)) return undefined;
  const words: string[] = [];
  const pattern = /"((?:\\.|[^"])*)"|'([^']*)'|(\S+)/g;
  for (const match of command.matchAll(pattern)) {
    words.push(match[1] ?? match[2] ?? match[3] ?? "");
    if (words.length > 32) break;
  }
  const ln_index = words.findIndex(
    (w, i) => w === "ln" && (i === 0 || words[i - 1] !== "find"),
  );
  if (ln_index === -1) return undefined;
  let src: string | undefined;
  let linkname: string | undefined;
  let target_dir: string | undefined;
  let i = ln_index + 1;
  while (i < words.length) {
    const w = words[i] ?? "";
    if (w === "--") {
      i++;
      continue;
    }
    if (w === "-t" || w === "--target-directory") {
      if (i + 1 >= words.length) return undefined;
      target_dir = words[i + 1];
      i += 2;
      continue;
    }
    if (w.startsWith("--target-directory=")) {
      target_dir = w.slice("--target-directory=".length);
      i++;
      continue;
    }
    if (w.startsWith("-") && w !== "-") {
      i++;
      continue;
    }
    if (/^(?:&&|\|\||;)/.test(w)) break;
    if (src === undefined) src = w;
    else if (linkname === undefined) linkname = w;
    else return undefined;
    i++;
  }
  if (!src) return undefined;
  if (!linkname && target_dir) linkname = `${target_dir}/${src}`;
  if (!linkname) return undefined;
  return [src, linkname];
}

function canonicalize_path(absolute_path: string): string | undefined {
  try {
    return realpathSync(absolute_path);
  } catch {
    try {
      const real_dir = realpathSync(dirname(absolute_path));
      const base = basename(absolute_path);
      return base === "." || base === "" ? real_dir : join(real_dir, base);
    } catch {
      return undefined;
    }
  }
}

function is_within_path(parent: string, child: string): boolean {
  return child !== parent && child.startsWith(parent + "/");
}

function assess_ln_command(
  command: string,
  cwd: string,
): DestructiveAction | undefined {
  if (!/(^|[^A-Za-z0-9_])(?:sudo\s+)?ln\s/.test(command)) return undefined;
  const args = extract_ln_args(command);
  if (!args) return undefined;
  const [raw_src, raw_linkname] = args;
  const abs_src = resolve(cwd, raw_src);
  const abs_linkname = resolve(cwd, raw_linkname);
  const resolved_src = canonicalize_path(abs_src);
  const resolved_linkname = canonicalize_path(abs_linkname);

  if (
    resolved_src &&
    resolved_linkname &&
    (resolved_src === resolved_linkname ||
      is_within_path(resolved_src, resolved_linkname))
  ) {
    const self_ref = resolved_src === resolved_linkname;
    return {
      title: "Confirm symlink loop?",
      description: self_ref
        ? `ln would create a symlink loop: ${raw_linkname} → ${raw_src}.`
        : `${raw_linkname} is inside ${raw_src}; the link would point at itself.`,
      reason: self_ref
        ? `Symlink loop: ${raw_linkname} resolves to itself`
        : `Symlink loop: ${raw_linkname} is inside ${raw_src}`,
      allow_key: self_ref
        ? `ln:block:self-ref:${resolved_linkname}`
        : `ln:block:nested:${resolved_src}->${resolved_linkname}`,
    };
  }

  if (!lstatSync(abs_linkname, { throwIfNoEntry: false })) return undefined;
  if (is_git_recoverable(cwd, abs_linkname)) return undefined;
  return {
    title: "Confirm symlink overwrites a file?",
    description: `${preview(command)} overwrites ${raw_linkname} (${get_git_recoverability(cwd, abs_linkname)}).`,
    reason: `Overwrites an untracked or uncommitted file: ${raw_linkname}`,
    allow_key: `ln:${abs_src}->${abs_linkname}`,
  };
}

function describe_path_risk(cwd: string, paths: string[]): string {
  const risky = paths.filter((path) => !is_git_recoverable(cwd, path));
  if (risky.length === 0) return "Deletes git-recoverable files";

  const risks = new Set(risky.map((path) => get_git_recoverability(cwd, path)));
  if (risks.has("untracked")) {
    return "Deletes untracked files or directories that git cannot restore";
  }
  if (risks.has("tracked-dirty")) {
    return "Deletes files with uncommitted changes";
  }
  return "Deletes files outside git recovery";
}

function assess_rm_command(
  command: string,
  cwd: string,
  session_created_paths: ReadonlySet<string> = new Set(),
): DestructiveAction | undefined {
  if (!/(^|[;&|]\s*)(sudo\s+)?(rm|rmdir|unlink|shred)\b/.test(command)) {
    return undefined;
  }

  const paths = extract_command_paths(command, "rm");
  if (paths && paths.length > 0) {
    if (
      paths.every((path) => {
        const absolute = resolve(cwd, path);
        return (
          session_created_paths.has(absolute) || is_agent_temp_path(absolute)
        );
      })
    ) {
      return undefined;
    }
    if (paths.every((path) => is_git_recoverable(cwd, path))) {
      return undefined;
    }
  }

  const reason = paths?.length
    ? describe_path_risk(cwd, paths)
    : "Deletes files or directories";
  return {
    title: "Confirm destructive command?",
    description: `${reason}: ${preview(command)}`,
    reason,
    allow_key: "bash:rm-risky",
  };
}

function assess_git_rm_command(
  command: string,
  cwd: string,
): DestructiveAction | undefined {
  if (!/(^|[;&|]\s*)git\s+rm\b/.test(command)) return undefined;
  if (/\s-f\b|\s--force\b/.test(command)) {
    return {
      title: "Confirm forced git removal?",
      description: `Forced git removal can discard uncommitted file changes: ${preview(command)}`,
      reason: "Force-removes files from git",
      allow_key: "bash:git-rm-force",
    };
  }

  const paths = extract_command_paths(command, "git-rm");
  if (
    paths &&
    paths.length > 0 &&
    paths.every((path) => is_git_recoverable(cwd, path))
  ) {
    return undefined;
  }

  const reason = paths?.length
    ? describe_path_risk(cwd, paths)
    : "Deletes tracked files from git";
  return {
    title: "Confirm git removal?",
    description: `${reason}: ${preview(command)}`,
    reason,
    allow_key: "bash:git-rm-risky",
  };
}

function assess_git_reset_hard(
  command: string,
  cwd: string,
): DestructiveAction | undefined {
  if (!/(^|[;&|]\s*)git\s+reset\b[^;&|]*--hard\b/.test(command)) {
    return undefined;
  }
  if (git(["status", "--porcelain=v1"], cwd) === "") return undefined;

  return {
    title: "Confirm hard reset?",
    description: `This can discard uncommitted tracked changes: ${preview(command)}`,
    reason: "Discards uncommitted tracked changes",
    allow_key: "bash:git-reset-hard",
  };
}

export function assess_bash_command(
  command: string,
  cwd = process.cwd(),
  session_created_paths: ReadonlySet<string> = new Set(),
): DestructiveAction | undefined {
  const normalized = command.trim();
  if (!normalized) return undefined;

  const specific =
    assess_ln_command(normalized, cwd) ??
    assess_rm_command(normalized, cwd, session_created_paths) ??
    assess_git_rm_command(normalized, cwd) ??
    assess_git_reset_hard(normalized, cwd);
  if (specific) return specific;

  const match = DESTRUCTIVE_COMMAND_PATTERNS.find(({ pattern }) =>
    pattern.test(normalized),
  );
  if (!match) return undefined;

  return {
    title: "Confirm destructive command?",
    description: `${match.reason}: ${preview(normalized)}`,
    reason: match.reason,
    allow_key: match.allow_key,
  };
}

function assess_file_write(
  cwd: string,
  path: unknown,
  session_created_paths: ReadonlySet<string> = new Set(),
): DestructiveAction | undefined {
  if (typeof path !== "string" || !path.trim()) return undefined;
  if (is_todo_planning_note(path)) return undefined;
  const absolute = resolve(cwd, path);
  if (!existsSync(absolute)) return undefined;
  if (session_created_paths.has(absolute)) return undefined;
  if (is_git_recoverable(cwd, path)) return undefined;

  const reason =
    get_git_recoverability(cwd, path) === "tracked-dirty"
      ? "Overwrites a file with uncommitted changes"
      : "Overwrites an untracked file git cannot restore";

  return {
    title: "Confirm file overwrite?",
    description: `${reason}: ${path}`,
    reason,
    allow_key: "write:risky-overwrite",
  };
}

function assess_file_edit(
  cwd: string,
  input: Record<string, unknown>,
  session_created_paths: ReadonlySet<string> = new Set(),
): DestructiveAction | undefined {
  const path = typeof input.path === "string" ? input.path : undefined;
  const edits = Array.isArray(input.edits) ? input.edits : [];
  let removed_chars = 0;
  let added_chars = 0;

  for (const edit of edits) {
    if (!edit || typeof edit !== "object") continue;
    const old_text = (edit as { oldText?: unknown }).oldText;
    const new_text = (edit as { newText?: unknown }).newText;
    if (typeof old_text === "string") removed_chars += old_text.length;
    if (typeof new_text === "string") added_chars += new_text.length;
  }

  if (removed_chars === 0 || removed_chars - added_chars < 200) {
    return undefined;
  }
  if (path && is_todo_planning_note(path)) return undefined;
  if (path && session_created_paths.has(resolve(cwd, path))) {
    return undefined;
  }
  if (path && is_git_recoverable(cwd, path)) return undefined;

  return {
    title: "Confirm large content removal?",
    description: `This edit removes ${removed_chars - added_chars} more characters than it adds${path ? ` in ${path}` : ""}.`,
    reason: path
      ? "Removes substantial content from a file git cannot fully restore"
      : "Removes substantial file content",
    allow_key: "edit:large-removal-risky",
  };
}

function assess_custom_tool(
  event: ToolCallEvent,
): DestructiveAction | undefined {
  if (!DESTRUCTIVE_CUSTOM_TOOL_NAME.test(event.toolName)) {
    return undefined;
  }

  const input = event.input as Record<string, unknown>;
  const query =
    typeof input.query === "string" ? `\n\nQuery: ${preview(input.query)}` : "";

  return {
    title: "Confirm destructive tool call?",
    description: `Tool ${event.toolName} appears destructive.${query}`,
    reason: `Potentially destructive tool: ${event.toolName}`,
    allow_key: `tool:${event.toolName}`,
  };
}

export function assess_tool_call(
  event: ToolCallEvent,
  cwd: string,
  session_created_paths: ReadonlySet<string> = new Set(),
): DestructiveAction | undefined {
  if (event.toolName === "bash") {
    const command = (event.input as { command?: unknown }).command;
    return typeof command === "string"
      ? assess_bash_command(command, cwd, session_created_paths)
      : undefined;
  }
  if (event.toolName === "write") {
    return assess_file_write(cwd, event.input.path, session_created_paths);
  }
  if (event.toolName === "edit") {
    return assess_file_edit(cwd, event.input, session_created_paths);
  }
  return assess_custom_tool(event);
}

type ConfirmDecision = "allow" | "allow-similar" | "block";

export async function confirm_action(
  action: DestructiveAction,
  ctx: ExtensionContext,
): Promise<ConfirmDecision> {
  if (!ctx.hasUI) return "block";

  const session_allow_blocked = is_session_allow_blocked(action.allow_key);
  const choices = session_allow_blocked
    ? (["Allow once", "Block"] as const)
    : (["Allow once", "Allow similar for this session", "Block"] as const);
  const choice = await ctx.ui.select(
    `${action.title}\n${action.description}${
      session_allow_blocked
        ? "\n\nSession-allow is disabled for this action."
        : ""
    }`,
    [...choices],
  );

  if (choice === "Allow once") return "allow";
  if (choice === "Allow similar for this session") {
    return "allow-similar";
  }

  ctx.ui.notify("Destructive action blocked", "info");
  return "block";
}

function blocked_reason(action: DestructiveAction): string {
  return `Blocked destructive action: ${action.reason}`;
}

function blocked_bash_result(action: DestructiveAction) {
  return {
    output: `${blocked_reason(action)}\n`,
    exitCode: 130,
    cancelled: false,
    truncated: false,
  };
}

export default async function confirm_destructive(pi: ExtensionAPI) {
  const allowed_for_session = new Set<string>();
  const pending_created_files = new Map<string, string>();
  const session_created_files = new Set<string>();

  function is_allowed(action: DestructiveAction): boolean {
    return allowed_for_session.has(action.allow_key);
  }

  async function should_allow(
    action: DestructiveAction,
    ctx: ExtensionContext,
  ): Promise<boolean> {
    if (is_allowed(action)) return true;

    const decision = await confirm_action(action, ctx);
    if (decision === "allow-similar") {
      allowed_for_session.add(action.allow_key);
      return true;
    }
    return decision === "allow";
  }

  pi.on(
    "tool_call",
    async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
      if (event.toolName === "write") {
        const path = event.input.path;
        if (typeof path === "string" && path.trim()) {
          const absolute = resolve(ctx.cwd, path);
          if (!existsSync(absolute)) {
            pending_created_files.set(event.toolCallId, absolute);
          }
        }
      }

      const action = assess_tool_call(event, ctx.cwd, session_created_files);
      if (!action) return;

      if (await should_allow(action, ctx)) return;

      return {
        block: true,
        reason: blocked_reason(action),
      };
    },
  );

  pi.on("tool_result", async (event: ToolResultEvent): Promise<void> => {
    const absolute = pending_created_files.get(event.toolCallId);
    if (!absolute) return;
    pending_created_files.delete(event.toolCallId);
    if (event.toolName === "write" && !event.isError) {
      session_created_files.add(absolute);
    }
  });

  pi.on(
    "user_bash",
    async (event: UserBashEvent, ctx): Promise<UserBashEventResult | void> => {
      const action = assess_bash_command(
        event.command,
        event.cwd,
        session_created_files,
      );
      if (!action) return;

      if (await should_allow(action, ctx)) return;

      return { result: blocked_bash_result(action) };
    },
  );
}
