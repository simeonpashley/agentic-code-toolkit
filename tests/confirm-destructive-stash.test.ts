/**
 * TDD suite for git-stash-drop protection in confirm-destructive.ts.
 *
 * Background: an agent popped a stash, then ran `git stash drop` to "clean
 * up" the now-unreferenced entry, and silently destroyed untracked work
 * the user hadn't reviewed. The protection must:
 *   - prompt on `git stash drop [name]` (any ref)
 *   - prompt on `git stash drop --all` and `git stash clear` (catastrophic)
 *   - prompt on `git stash pop` if it would discard the stash entry on
 *     conflict (deferred — covered by a follow-up test if implemented)
 *
 * Policy: hard block — no session-allow resurrection. Stashes are the
 * last-resort recovery mechanism for uncommitted work; if a user wants
 * one dropped, they should run it themselves with the ref visible.
 *
 * All tests use `assess_bash_command` directly; no UI is invoked.
 */
import { execFileSync } from "node:child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assess_bash_command,
  is_session_allow_blocked,
  type DestructiveAction,
} from "../extensions/confirm-destructive";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "agentic-code-toolkit-stash-"));
  mkdirSync(join(repo, ".git"));
  // Make at least one commit so `git stash` would have something to stash.
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repo,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
  execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], {
    cwd: repo,
  });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

// ── assess_bash_command: stash drop protection ────────────────────────

describe("git stash drop", () => {
  it("prompts on `git stash drop` (no ref)", () => {
    const action = assess_bash_command("git stash drop", repo);
    expect(action).toBeDefined();
    expect(action!.reason).toMatch(/stash/i);
    expect(action!.reason).toMatch(/drop|delete|discard|remove/i);
  });

  it("prompts on `git stash drop stash@{0}`", () => {
    const action = assess_bash_command("git stash drop stash@{0}", repo);
    expect(action).toBeDefined();
    expect(action!.reason).toMatch(/stash/i);
  });

  it("prompts on `git stash drop --all`", () => {
    const action = assess_bash_command("git stash drop --all", repo);
    expect(action).toBeDefined();
    expect(action!.reason).toMatch(/stash/i);
  });

  it("prompts on `git stash clear` (catastrophic — drops every entry)", () => {
    const action = assess_bash_command("git stash clear", repo);
    expect(action).toBeDefined();
    expect(action!.reason).toMatch(/stash/i);
    expect(action!.reason).toMatch(/all|clear|every/i);
  });

  it("warns that stash-drop keys collapse across refs — session-allow MUST be blocked", () => {
    // Both `git stash drop` and `git stash drop stash@{1}` resolve to the
    // same `allow_key: "bash:git-stash-drop"`. This is the exact hazard:
    // if session-allow were enabled, one click would silently approve
    // every future `stash drop` regardless of ref. That is why gap #3
    // (NO_SESSION_ALLOW) is necessary — the identical key is a known
    // limitation, not a bug to fix per-pattern.
    const a = assess_bash_command("git stash drop", repo);
    const b = assess_bash_command("git stash drop stash@{1}", repo);
    const c = assess_bash_command("git stash clear", repo);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    // a and b share the same key — this is the real finding:
    expect(a!.allow_key).toBe("bash:git-stash-drop");
    expect(b!.allow_key).toBe("bash:git-stash-drop");
    // clear is a different subcommand:
    expect(b!.allow_key).not.toBe(c!.allow_key);
  });

  it("matches across shell compound operators (&&, ||, ;)", () => {
    expect(
      assess_bash_command("git pull --rebase && git stash drop", repo),
    ).toBeDefined();
    expect(
      assess_bash_command("git stash drop; echo done", repo),
    ).toBeDefined();
    expect(assess_bash_command("git stash drop || true", repo)).toBeDefined();
  });

  it("does NOT prompt on `git stash list`, `git stash show`, `git stash apply` (read-only or recoverable)", () => {
    expect(assess_bash_command("git stash list", repo)).toBeUndefined();
    expect(assess_bash_command("git stash show", repo)).toBeUndefined();
    // apply does not drop the entry — user can re-apply if needed.
    expect(assess_bash_command("git stash apply", repo)).toBeUndefined();
  });

  it("does NOT prompt on `git stash` (push) — that creates, not destroys", () => {
    expect(assess_bash_command("git stash", repo)).toBeUndefined();
    expect(assess_bash_command("git stash push -u", repo)).toBeUndefined();
  });

  it("real-world repro: `git stash pop` followed by `git stash drop`", () => {
    // This is the exact shape of the incident: pop succeeds, then the
    // agent runs `git stash drop` to "clean up" the now-unreferenced
    // entry, silently destroying any work the user hadn't reviewed.
    const action = assess_bash_command("git stash pop && git stash drop", repo);
    expect(action).toBeDefined();
    expect(action!.reason).toMatch(/stash/i);
  });

  it("returns a DestructiveAction whose description surfaces the exact command", () => {
    const action: DestructiveAction | undefined = assess_bash_command(
      "git stash drop stash@{2}",
      repo,
    );
    expect(action).toBeDefined();
    expect(action!.description).toContain("git stash drop stash@{2}");
  });
});
// ── git stash pop --force ──────────────────────────────────────────

describe("git stash pop --force", () => {
  it("prompts on `git stash pop --force` (drops stash even on conflict)", () => {
    const action = assess_bash_command("git stash pop --force", repo);
    expect(action).toBeDefined();
    expect(action!.reason).toMatch(/stash|conflict|force/i);
  });

  it("prompts on `git stash pop -f` (short flag)", () => {
    const action = assess_bash_command("git stash pop -f", repo);
    expect(action).toBeDefined();
  });

  it("does NOT prompt on plain `git stash pop` (recoverable on failure)", () => {
    // `git stash pop` only drops the entry on successful apply; if apply
    // fails, the stash remains in the stack. The user can `git stash apply`
    // it later. So this is acceptable.
    const action = assess_bash_command("git stash pop", repo);
    expect(action).toBeUndefined();
  });

  it("blocks session-allow on the force-pop rule", () => {
    const action = assess_bash_command("git stash pop --force", repo);
    expect(action).toBeDefined();
    expect(is_session_allow_blocked(action!.allow_key)).toBe(true);
  });
});
