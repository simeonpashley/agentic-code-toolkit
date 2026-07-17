/**
 * TDD suite for the ln-safety assessor added to confirm-destructive.ts.
 *
 * Background: The agent ran `ln -sf <repo>/.env .env` from cwd `<repo>/`
 * and produced a self-referential symlink. The intent of this suite is to
 * lock in the policy that catches self-referential / clobbering `ln`
 * calls, scoped per src→linkname pair (not blanket), with the
 * self-referential case hard-blocked (no session-allow resurrection).
 *
 * All tests use a thrown-together real checkout to drive a real
 * `realpath` against — no mocks for fs.
 */

import { execFileSync } from "node:child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assess_bash_command,
  type DestructiveAction,
} from "../extensions/confirm-destructive";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "agentic-code-toolkit-ln-"));
  // Pretend git is recoverable by putting the repo under a `.git` shim.
  // assess_bash_command gates clobber prompts on `is_git_recoverable`.
  mkdirSync(join(repo, ".git"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

// ── assess_bash_command: ln safety ─────────────────────────────────────

describe("ln — self-referential (incident regression)", () => {
  it("prompts when .env would symlink to itself", () => {
    const src = join(repo, ".env");
    writeFileSync(src, "TOKEN=x\n");
    const action = assess_bash_command(`ln -sf ${src} .env`, repo);
    expect(action).toBeDefined();
    expect(action!.reason).toMatch(/self-ref|cycle|loop|itself/i);
  });

  it("prompts on the exact command from the incident", () => {
    // Recreate the incident shape verbatim: ln -sf <abs src> .env
    // where .env lives at <cwd>/.env and src is <cwd>/.env.
    const cwd = repo; // simulate the original incident cwd
    const src = join(cwd, ".env");
    writeFileSync(src, "TOKEN=x\n");
    const command = `ln -sf ${src} .env`;
    const action = assess_bash_command(command, cwd);
    expect(action).toBeDefined();
  });

  it("hard-blocks self-referential ln with a non-resurrectable allow_key", () => {
    // The whole point of the bug class: a session-wide allow must NOT
    // be able to revive "ln a path to itself" — that operation has no
    // legitimate use. If `allow_key` ever matched what `should_allow`
    // stores, a future bug could re-enable it. Lock that down.
    const cwd = repo;
    writeFileSync(join(cwd, ".env"), "TOKEN=x\n");
    const command = `ln -sf ${join(cwd, ".env")} .env`;
    const action = assess_bash_command(command, cwd);
    expect(action).toBeDefined();
    // The exact shape of the key matters — see implementation.
    // Pin it so the contract is reviewed when refactored.
    expect(action!.allow_key.startsWith("ln:block:")).toBe(true);
  });
});

describe("ln — target inside source directory", () => {
  it("prompts when ln would create a sibling inside the source dir", () => {
    // `ln -s foo foo/bar` — bar is inside foo/, foo/ already exists.
    mkdirSync(join(repo, "foo"));
    writeFileSync(join(repo, "foo", "x"), "");
    const action = assess_bash_command("ln -s foo foo/bar", repo);
    expect(action).toBeDefined();
    expect(action!.reason).toMatch(/inside|prefix|cycle|container/i);
  });
});

describe("ln — clobbering an existing non-recoverable file", () => {
  it("prompts when ln would overwrite an untracked file", () => {
    // .git shim is in place but the file is untracked → not git-recoverable.
    writeFileSync(join(repo, "secrets.txt"), "real secret\n");
    const action = assess_bash_command("ln -sf /elsewhere/x secrets.txt", repo);
    expect(action).toBeDefined();
    expect(action!.allow_key).not.toMatch(/^ln:block:/);
  });

  it("does NOT prompt when ln targets a path under the .git-recoverable tree", () => {
    // Tracked file → safe to overwrite (git can restore).
    execFileSync("git", ["init", "--quiet", "."], { cwd: repo });
    writeFileSync(join(repo, "tracked.txt"), "v1\n");
    execFileSync("git", ["add", "tracked.txt"], { cwd: repo });
    execFileSync(
      "git",
      [
        "-c",
        "user.email=t@t",
        "-c",
        "user.name=t",
        "commit",
        "--quiet",
        "-m",
        "i",
      ],
      { cwd: repo },
    );
    const action = assess_bash_command("ln -sf /elsewhere/x tracked.txt", repo);
    expect(action).toBeUndefined();
  });
});

describe("ln — safe new link passes silently", () => {
  it("returns undefined when the destination does not exist and nothing is in danger", () => {
    // New file under /tmp nowhere near cwd's existing tracked set.
    const action = assess_bash_command(
      "ln -s /tmp/something/${rand}/target.txt " +
        "/tmp/something/${rand}/link.txt",
      repo,
    );
    expect(action).toBeUndefined();
  });
});

describe("ln — scoped allow_key per pair", () => {
  it("two ln calls with different src are distinct allow_keys", () => {
    writeFileSync(join(repo, "a"), "a\n");
    writeFileSync(join(repo, "b"), "b\n");
    const k1 = assess_bash_command("ln -sf /x a", repo)!.allow_key;
    const k2 = assess_bash_command("ln -sf /y b", repo)!.allow_key;
    expect(k1).not.toBe(k2);
  });

  it("two ln calls with the same src and the same clobber target produce the same allow_key", () => {
    writeFileSync(join(repo, "shared"), "x\n");
    const k1 = assess_bash_command("ln -sf /p shared", repo)!.allow_key;
    const k2 = assess_bash_command("ln -sf /p shared", repo)!.allow_key;
    expect(k1).toBe(k2);
  });
});

describe("ln — matches inside compound commands", () => {
  it("still detects ln when chained with `&&` and other segments", () => {
    writeFileSync(join(repo, ".env"), "x\n");
    // Same as the original incident: ln prepended with `&&` to
    // a multi-step command. The assessor must not bail when the
    // command contains shell metacharacters (existing
    // extract_command_paths does and that would miss the bug).
    const src = join(repo, ".env");
    const action = assess_bash_command(
      `cd ${repo} && ln -sf ${src} .env && echo done`,
      repo,
    );
    expect(action).toBeDefined();
  });
});
