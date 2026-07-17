---
name: agent-doc-curation
description: "Use when MEMORY.md has accumulated entries, AGENTS.md rules reference code that may have moved, ADRs may have been superseded, or before a major refactor. Validates and prunes the canonical documents every session reads (MEMORY.md, agent/AGENTS.md, docs/adr/, CONTEXT.md) against current code reality, classifies each entry by staleness and overlap, and proposes migrations between them. Promotes stable MEMORY.md lines to AGENTS.md or ADRs, flags duplicates, defers deletes for human approval. Do not use during a session's regular close-out (use opus-learn) or to add new durable lessons."
disable-model-invocation: true
---

# Agent Doc Curation

Validate and prune the canonical documents that the agent reads every session:

- `MEMORY.md` (root) — prompt-injected staging area for fresh lessons
- `agent/AGENTS.md` — global declarative rules (project's CLAUDE.md equivalent)
- `docs/adr/*.md` — architectural decision records
- `CONTEXT.md` (optional) — ubiquitous language glossary

This skill runs validation scripts, classifies each entry, and proposes migrations. It never auto-mutates canonical docs without explicit invocation of `migrate-entry.ts`.

## When to use

- MEMORY.md has accumulated entries (more than ~5) and may have stale or overlapping ones
- AGENTS.md rules reference code that may have moved or been removed
- ADRs describe decisions that may have been reversed or superseded
- Before a major refactor or before opening a long-lived branch
- Quarterly / after a series of opus-learn invocations

## Scripts

All three scripts are skill-scoped and run with `npx tsx`:

| Script                       | Purpose                                                | Mutates?                |
| ---------------------------- | ------------------------------------------------------ | ----------------------- |
| `scripts/validate-memory.ts` | Run each MEMORY.md entry's `Verify:` step              | No (read-only)          |
| `scripts/check-canonical.ts` | Validate AGENTS.md rules and ADRs against code         | No (read-only)          |
| `scripts/migrate-entry.ts`   | Move a MEMORY.md entry to AGENTS.md / ADR / CONTEXT.md | Yes (mutates both ends) |

## Workflow

1. **Validate memory**: `npx tsx skills/agent-doc-curation/scripts/validate-memory.ts`
   - Parses MEMORY.md entries (one per line)
   - For each entry, classifies the `Verify:` step and runs it:
     - Shell command (`pnpm test`, `npx tsc ...`) → `spawnSync` with 30s timeout
     - File path (`src/foo.ts`) → `existsSync` check
     - Free-form text → marked UNVERIFIABLE
   - Emits JSON: `{ summary, entries: [{ id, timestamp, area, status, evidence, ... }] }`

2. **Check canonical**: `npx tsx skills/agent-doc-curation/scripts/check-canonical.ts`
   - For AGENTS.md: extracts file paths and shell commands from tagged bullets; checks existence / runs commands
   - For each ADR: extracts paths from the Decision section; checks existence
   - Emits JSON: `{ summary, rules: [...], adrs: [...] }`

3. **Review report**:
   - **FAIL** entries → investigate. If the rule still applies, fix the verify step or the underlying code. If not, mark stale.
   - **DRIFT** canonical → fix the rule to match code reality, or fix the code.
   - **STALE** entries → either delete from MEMORY.md (no longer relevant) or promote to canonical.

4. **Migrate stable entries** (only after manual validation):

   ```
   npx tsx skills/agent-doc-curation/scripts/migrate-entry.ts m3 AGENTS.md
   npx tsx skills/agent-doc-curation/scripts/migrate-entry.ts m3 adr:my-decision
   npx tsx skills/agent-doc-curation/scripts/migrate-entry.ts m3 CONTEXT.md
   ```

   - Appends the entry's rule to AGENTS.md (as a `[doc]` tagged bullet) OR
   - Creates `docs/adr/NNNN-<slug>.md` from the entry OR
   - Appends a glossary term to CONTEXT.md
   - Removes the entry from MEMORY.md

5. **Re-run** validators until clean.

## Invocation context

These scripts run inside whichever project invokes the skill, not in this repo. Default paths are relative to the current working directory:

| Env var        | Default           | Notes                                                                                                                                                                 |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEMORY_PATH`  | `MEMORY.md`       | The project's MEMORY.md (or workspace MEMORY.md if it lives at the project root)                                                                                      |
| `AGENTS_PATH`  | `agent/AGENTS.md` | In this repo, the canonical AGENTS file. In other projects, set this to the global symlink (e.g. `~/.pi/agent/AGENTS.md`) since `agent/AGENTS.md` doesn't exist there |
| `ADR_DIR`      | `docs/adr`        | Per-project ADRs                                                                                                                                                      |
| `CONTEXT_PATH` | `CONTEXT.md`      | Optional ubiquitous-language glossary                                                                                                                                 |
| `KIT_ROOT`     | `.`               | Used only by `check-canonical.ts` for command execution cwd                                                                                                           |

Override per-project examples:

```bash
# Validate against this project's MEMORY and the global AGENTS
MEMORY_PATH=./MEMORY.md \
AGENTS_PATH=~/.pi/agent/AGENTS.md \
  npx tsx skills/agent-doc-curation/scripts/check-canonical.ts
```

## MEMORY.md entry format expected

```
- [ISO timestamp][area] Trigger: <when this applies>. Rule: <required future behaviour>. Verify: <evidence required>.
```

The timestamp is optional (legacy entries may omit it; the area is then the lone bracketed group). The `Verify:` value can be:

- A shell command — e.g. `pnpm run verify`, `npx tsc --noemit`
- A file path — e.g. `src/foo.ts`, `tests/foo.test.ts`
- Free-form text — entry marked UNVERIFIABLE (still valid, just no auto-check)

## Cadence

Invoke periodically — not on every session. Suggested triggers:

- After every 5–10 `opus-learn` invocations (audit what accumulated in MEMORY.md)
- Before opening a long-lived branch or starting a major refactor
- Quarterly as a hygiene pass
- Anytime you suspect drift (an MEMORY entry's Verify has been failing, or a referenced file has moved)

Validating is cheap and read-only. Migrating is deliberate — promote only stable entries that have survived several validation cycles.

## Safety

- `validate-memory.ts` and `check-canonical.ts` run shell commands embedded in MEMORY.md / AGENTS.md with a 30s timeout. If a command is destructive or has side effects, review before re-running.
- `migrate-entry.ts` is the only mutating script. It requires explicit invocation and never deletes from canonical docs (only appends).

## Related

- `opus-learn` — context-bound per-session close-out (reactive). This skill is artifact-bound periodic curation (proactive).
- `grill-with-docs` — invokes `CONTEXT.md` and `docs/adr/` for plan grilling.
- `requesting-code-review` — for review of work, not docs.
