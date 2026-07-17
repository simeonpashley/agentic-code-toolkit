# Agent Instructions

> **Rule format:** This file inherits the rule format from [agent/AGENTS.md](agent/AGENTS.md). Every rule must declare its enforcement mode (`[mechanical]` or `[doc]`); the format spec lives once in the global file.

## Global Config: Fix in Repo First

This repo is the source of truth for global pi config installed to `~/.pi/agent/`.
**Any issue caused by files in `~/.pi/agent/` MUST be fixed in this repo**, then
reinstalled — never fix only the installed copy.

- `extensions/` → `~/.pi/agent/extensions/`
- `scripts/` → `~/.pi/agent/scripts/`
- `skills/` → `~/.pi/agent/skills/` (if applicable)
- `tools/` → `~/.pi/agent/tools/` (if applicable)

After fixing in this repo, re-install: `pnpm run install:global`.

## File Routing

This repo is source of truth. Installed locations are overwritten on install.

| Edit here (source)              | Installed at                   | Overwritten on install            |
| ------------------------------- | ------------------------------ | --------------------------------- |
| `skills/`                       | `~/.agents/skills/`            | ✅                                |
| `prompts/`                      | `~/.pi/agent/prompts/`         | ✅                                |
| `extensions/`                   | `~/.pi/agent/extensions/`      | ✅                                |
| `agent/AGENTS.md`               | `~/.pi/agent/AGENTS.md`        | ✅                                |
| `agent/APPEND_SYSTEM.md`        | `~/.pi/agent/APPEND_SYSTEM.md` | ✅                                |
| `agent/settings-overrides.json` | `~/.pi/agent/settings.json`    | partial — per-key deep-merge only |
| `scripts/`                      | `~/.pi/agent/scripts/`         | ✅                                |
| `agent/agents/`                 | `~/.pi/agent/agents/`          | ✅                                |

**Rule: Always edit source (this repo). Never edit installed locations.**

After changes: `pnpm run install:global`

### Settings overrides — partial-install contract

`agent/settings-overrides.json` ships **only intentional departures** from
pi's runtime defaults (see `agent/settings-overrides.md` for the per-key
schema and rationale). The installer (`scripts/install-global.ts`)
loads it, runs `applyOverride()` from `scripts/settings-merge.ts`, and:

1. **Validates** each known key against the `Settings` interface (type +
   enum where applicable). Unknown keys are surfaced in the report.
2. **Strips** keys whose value matches pi's runtime default — so the
   override file ships only enforced intent, never re-states defaults.
3. **Deep-merges** the remaining values into `~/.pi/agent/settings.json`,
   leaving all other keys untouched.
4. **Writes only when values actually change** (semantic compare, not
   byte-for-byte, so reformatting doesn't trigger a write).
5. **Reports drift in two buckets**: live keys whose values differ
   from pi's runtime default (real opinions the repo should consider
   enforcing), and live keys whose values equal pi's default
   ("inherited defaults" — pi manages them; we just don't ship them
   in the override). The boundary is repo-enforced vs **personal/
   runtime** — not repo vs unmanaged.

Type-enum and default values are pinned to `@earendil-works/pi-coding-agent`
0.80.2; bump them when upgrading pi past a release that changes
`core/settings-manager.d.ts` or the getter fallbacks in
`core/settings-manager.js`. The hand-maintained table lives as
`SETTINGS_DEFAULTS` in `scripts/settings-merge.ts` and is the source of
truth for both validation and default-stripping.

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**

```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**

- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var
