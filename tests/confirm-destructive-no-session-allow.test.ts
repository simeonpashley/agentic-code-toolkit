/**
 * TDD suite for "no session-allow" on high-stakes destructive actions.
 *
 * Background: An agent popped a stash, then ran `git stash drop` to "clean
 * up" the now-unreferenced entry, and silently destroyed untracked work
 * the user hadn't reviewed. The root cause was twofold:
 *
 *   1. `git stash drop` was not in DESTRUCTIVE_COMMAND_PATTERNS at all
 *      (now fixed — see confirm-destructive-stash.test.ts).
 *   2. Even with the pattern present, a single click on
 *      "Allow similar for this session" would cache `bash:git-stash-drop`
 *      for the entire session — silently auto-approving every future
 *      `git stash drop` the agent ran.
 *
 * The second gap is the more dangerous one because it affects every
 * already-prompted destructive pattern, not just the new stash rule.
 *
 * Policy: certain high-stakes `allow_key` prefixes are immune to session
 * caching. The UI must NOT offer "Allow similar for this session" for
 * those — only "Allow once" and "Block".
 */
import { describe, it, expect } from "vitest";
import {
  is_session_allow_blocked,
  assess_bash_command,
  confirm_action,
  type DestructiveAction,
} from "../extensions/confirm-destructive";

// ── predicate ───────────────────────────────────────────────────────

describe("is_session_allow_blocked — high-stakes key prefixes", () => {
  it("blocks session-allow on stash drop", () => {
    expect(is_session_allow_blocked("bash:git-stash-drop")).toBe(true);
  });

  it("blocks session-allow on stash clear", () => {
    expect(is_session_allow_blocked("bash:git-stash-clear")).toBe(true);
  });

  it("blocks session-allow on git clean (deletes untracked files)", () => {
    expect(is_session_allow_blocked("bash:git-clean")).toBe(true);
  });

  it("blocks session-allow on git rm -f (force-removes files)", () => {
    expect(is_session_allow_blocked("bash:git-rm-force")).toBe(true);
  });

  it("blocks session-allow on git reset --hard", () => {
    expect(is_session_allow_blocked("bash:git-reset-hard")).toBe(true);
  });

  it("blocks session-allow on git checkout -- . / git restore .", () => {
    expect(is_session_allow_blocked("bash:git-discard-all")).toBe(true);
  });

  it("blocks session-allow on find -delete / find -exec rm", () => {
    expect(is_session_allow_blocked("bash:find-delete")).toBe(true);
  });

  it("blocks session-allow on rsync --delete", () => {
    expect(is_session_allow_blocked("bash:rsync-delete")).toBe(true);
  });

  it("does NOT block session-allow on risky rm (recoverable scoped deletes)", () => {
    // bash:rm-risky is gated by is_git_recoverable already; if the user
    // accepts, accepting similar is a reasonable convenience.
    expect(is_session_allow_blocked("bash:rm-risky")).toBe(false);
  });

  it("does NOT block session-allow on ln (already per-pair scoped)", () => {
    // ln allow_keys include the src/linkname pair, so widening is impossible
    // by construction — no need to block session-allow.
    expect(is_session_allow_blocked("ln:foo->bar")).toBe(false);
  });
});

// ── end-to-end: every destructive action's allow_key is consistent ──

describe("assess_bash_command — every regex-pattern key is allow-blocked", () => {
  // Snapshot of the regex array's keys. Adding a new entry to
  // DESTRUCTIVE_COMMAND_PATTERNS requires a matching entry in
  // NO_SESSION_ALLOW — this test enforces that the policy stays in sync.
  const expected_blocked: Array<{
    label: string;
    action: () => DestructiveAction | undefined;
  }> = [
    {
      label: "git stash drop",
      action: () => assess_bash_command("git stash drop", "/tmp"),
    },
    {
      label: "git stash clear",
      action: () => assess_bash_command("git stash clear", "/tmp"),
    },
    {
      label: "git clean -fd",
      action: () => assess_bash_command("git clean -fd", "/tmp"),
    },
    {
      label: "git rm -rf",
      action: () => assess_bash_command("git rm -rf build/", "/tmp"),
    },
    {
      label: "git reset --hard",
      action: () => assess_bash_command("git reset --hard origin/main", "/tmp"),
    },
    {
      label: "truncate -s 0",
      action: () => assess_bash_command("truncate -s 0 access.log", "/tmp"),
    },
    {
      label: "dd of=…",
      action: () => assess_bash_command("dd of=/dev/sda", "/tmp"),
    },
    {
      label: "rsync --delete",
      action: () =>
        assess_bash_command("rsync -a --delete /src/ /dst/", "/tmp"),
    },
    {
      label: "find -delete",
      action: () =>
        assess_bash_command("find /tmp/junk -type f -delete", "/tmp"),
    },
    {
      label: "mkfs / fdisk / parted / wipefs",
      action: () => assess_bash_command("mkfs.ext4 /dev/sdb1", "/tmp"),
    },
  ];

  for (const { label, action } of expected_blocked) {
    it(`${label} → is_session_allow_blocked(allow_key) === true`, () => {
      const a = action();
      expect(a).toBeDefined();
      expect(is_session_allow_blocked(a!.allow_key)).toBe(true);
    });
  }
});

// ── confirm_action: integration via fake UI ──────────────────────────

interface FakeUiCall {
  prompt: string;
  choices: readonly string[];
}

function fake_ctx_with_ui(responses: FakeUiCall[]): {
  ctx: import("@earendil-works/pi-coding-agent").ExtensionContext;
  recorded: FakeUiCall[];
} {
  const recorded: FakeUiCall[] = [];
  let i = 0;
  const ctx = {
    hasUI: true,
    ui: {
      select: async (
        prompt: string,
        choices: readonly string[],
      ): Promise<string | undefined> => {
        recorded.push({ prompt, choices });
        const response = responses[i++];
        return response?.choices[0];
      },
      notify: () => {},
    },
  } as unknown as import("@earendil-works/pi-coding-agent").ExtensionContext;
  return { ctx, recorded };
}

describe("confirm_action — UI choices are filtered by session-allow policy", () => {
  it("does NOT offer 'Allow similar' for git stash drop", async () => {
    const action = assess_bash_command("git stash drop", "/tmp");
    expect(action).toBeDefined();
    const { ctx, recorded } = fake_ctx_with_ui([]);
    await confirm_action(action!, ctx);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.choices).not.toContain(
      "Allow similar for this session",
    );
    expect(recorded[0]!.choices).toContain("Allow once");
    expect(recorded[0]!.choices).toContain("Block");
  });

  it("does NOT offer 'Allow similar' for git clean -fd", async () => {
    const action = assess_bash_command("git clean -fd", "/tmp");
    expect(action).toBeDefined();
    const { ctx, recorded } = fake_ctx_with_ui([]);
    await confirm_action(action!, ctx);
    expect(recorded[0]!.choices).not.toContain(
      "Allow similar for this session",
    );
  });

  it("DOES offer 'Allow similar' for bash:rm-risky (low-stakes)", async () => {
    // bash:rm-risky is gated by is_git_recoverable; session-allow is
    // reasonable convenience. To trigger the action we need a non-recoverable
    // path — use an absolute path that's not in any git repo (cwd=/tmp).
    const action = assess_bash_command("rm /tmp/some-untracked-file", "/tmp");
    expect(action).toBeDefined();
    expect(action!.allow_key).toBe("bash:rm-risky");
    expect(is_session_allow_blocked(action!.allow_key)).toBe(false);
    const { ctx, recorded } = fake_ctx_with_ui([]);
    await confirm_action(action!, ctx);
    expect(recorded[0]!.choices).toContain("Allow similar for this session");
  });

  it("annotates the prompt when session-allow is disabled", async () => {
    const action = assess_bash_command("git stash drop", "/tmp");
    expect(action).toBeDefined();
    const { ctx, recorded } = fake_ctx_with_ui([]);
    await confirm_action(action!, ctx);
    expect(recorded[0]!.prompt).toContain("Session-allow is disabled");
  });
});
