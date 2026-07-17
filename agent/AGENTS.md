# Agent Instructions

## Rule Format

Every rule in this file MUST be tagged with its enforcement mode:

- `[mechanical]` — enforced by test, lint, type-check, or pre-commit hook. Cannot be bypassed without breaking the enforcer.
- `[doc]` — enforced only by being written down. Agent is expected to comply via reading.

Format: tag appears inline at the start of the rule. Name the enforcer (mechanical) or holder (doc) so the agent can verify compliance:

```md
- [mechanical] All inputs must be validated. (Enforcer: `tests/validation.test.ts`)
- [doc] All architectural decisions require an ADR. (Holder: `docs/adr/`)
```

This rule itself is `[doc]` — enforced by reading, with a planned mechanical check (`scripts/check-agents-md.ts`) that will fail CI if any rule in this file lacks a tag.

## Global Config: Fix in Repo First

This repo is the source of truth for global pi config installed to `~/.pi/agent/`.
**Any issue caused by files in `~/.pi/agent/` MUST be fixed in this repo**, then
reinstalled — never fix only the installed copy.

- `extensions/` → `~/.pi/agent/extensions/`
- `scripts/` → `~/.pi/agent/scripts/`
- `skills/` → `~/.pi/agent/skills/` (if applicable)
- `tools/` → `~/.pi/agent/tools/` (if applicable)

After fixing in this repo, re-install: `pnpm run install:global`.

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

## Token Hygiene (Phase 1 Warn-Only)

[doc] The token-hygiene extension (`extensions/token-hygiene/`) mechanically enforces
several token-efficiency rules via advisory Phase 1 warnings:

- **Duplicate read/search warnings** — reading the same unchanged file range or
  repeating the same grep/glob/websearch/webfetch query triggers a warning (once
  per duplicate)
- **Bash file-dump nudges** — `cat`, `head`, `tail`, `sed -n '<range>p'`,
  unbounded `find`, and `ls -R` trigger short nudges
- **Large read warnings** — `read` without `limit` on files above the line
  threshold triggers a warning
- **`/token-hygiene` report** — shows context buckets, warnings, biggest
  avoidable debris, candidate reductions, and data controls

[doc] All Phase 1 warnings are advisory — they never cancel, replace, modify, or
hide the original tool call or result. (Holder: skills/token-efficiency/SKILL.md
Mechanical Enforcement section)

[doc] Phase 2 automatic bash output compression is NOT implemented. Do not assume
any compression layer is active. (Holder: skills/token-efficiency/SKILL.md Phase 2
Compression — Not Implemented section)

[doc] Apply the gates in [sanity-gates.md](docs/sanity-gates.md) at every one of these trigger points:

- Before producing or executing a plan.
- Before claiming work is complete or fixed.
- Before any irreversible shell action — `rm -rf`, `drop`, `force-push`, `migrate --apply` against prod data, or anything matching `**/KNOWN-IRREVERSIBLE/**`.
- Before recommending a design that adds a dependency, changes a schema, alters auth/authz, or touches a security-relevant surface.

Detail (evidence format, edge-case checklists, escalation table, worked example) lives in [sanity-gates.md](docs/sanity-gates.md) (installed at `~/.pi/agent/docs/sanity-gates.md`). This entry stays thin so AGENTS.md remains a routing table, not policy.
