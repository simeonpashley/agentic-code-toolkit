---
name: opus-learn
description: |
  Use when context is about to close or be lost — at session end, when switching projects, or before pruning conversation history — to capture durable operating lessons before they fade. Drives a re-read of the session transcript and a checklist: decide whether the work warrants an ADR (then delegate the write to opus-doc-writer), append a one-line MEMORY.md entry only when a repo-specific, evidence-backed rule prevents a plausible repeated mistake, and skip session narrative, task summaries, or speculation. Invoke early and often; late invocations lose the detail that makes lessons sharp. Do not use for general documentation, debugging, or post-hoc summaries of what happened this session.
---

## Goal

Complete the post-session close-out. Apply each item deliberately. Do not skip an applicable item because it feels minor, but do not add prompt bloat where there is no durable value.

## When to invoke

Invoke `opus-learn` whenever context is about to close or be lost, not just at session end:

- End of a session
- Switching tasks or projects
- Before pruning conversation history
- After any surprising or non-obvious finding

The skill operates on the context it can see at invocation time. Invoke early and often — late invocations lose the context that would have made the lesson sharp.

## Placement rule

AGENTS.md tells the agent how to work.
MEMORY.md tells the agent what previous work proved is easy to get wrong.

Use this routing:

- `docs/adr/` = non-obvious architectural or technical decisions
- `MEMORY.md` = terse durable prompt memory

## Instructions

Before interacting with files, **thoroughly read your entire session transcript history, thought blocks, internal tensions, and terminal execution logs**. Do not rely solely on the final `git diff` or current file states; the most critical engineering lessons, configuration-weakening traps, and boundary errors are often found in code paths you self-reverted or corrected mid-session.

Work through each checklist item:

1. Determine whether the item applies this session.
2. If it applies, perform the action and mark `[x]`.
3. If it does not apply, mark `[n/a]` with a brief note.

Do not leave items unchecked unless explicitly deferred with a note explaining why.

## Completion Checklist

- [ ] Add decisions in `docs/adr/`.
  - Determine if ADR needed: all three must be true:
    1. **Hard to reverse** — cost of changing your mind later is meaningful
    2. **Surprising without context** — future reader will wonder "why on earth?"
    3. **Result of a real trade-off** — genuine alternatives, picked one for specific reasons
  - **What qualifies**: architectural shape, integration patterns, lock-in tech choices, boundary decisions, deliberate deviations, invisible constraints, non-obvious rejected alternatives
  - **If ADR needed**: invoke `opus-doc-writer` subagent to write the ADR (owns format consistency)
  - Apply when: this session made or changed a non-obvious architectural or technical decision.

- [ ] **APPEND** single-line to `MEMORY.md` only when a durable operating lesson was proven.

  `MEMORY.md` is prompt-injected. Treat every line as expensive.

  Add an entry only if all are true:
  1. It would change future agent behaviour.
  2. It is repo-specific or non-obvious.
  3. It prevents a plausible repeated mistake.
  4. It is supported by observed evidence from this session.
  5. It is not already obvious from `AGENTS.md`, `docs/way/*`, or existing memory.

  Do not add:
  - Session narrative.
  - Completed task summaries.
  - Temporary state.
  - Generic engineering advice.
  - ADR rationale.
  - Anything already covered by a stronger source.
  - Speculation not validated by commands, tests, diffs, or observed failures.

  Entry format:

  ```md
  - [ISO format timestamp][area] Trigger: <when this applies>. Rule: <required future behaviour>. Verify: <evidence required>.
  ```

### Good examples:

```markdown
- [ado] Trigger: work touches Azure DevOps data. Rule: ADO is read-only; write only to the SQLite mirror. Verify: no ADO create, edit, delete, or patch calls were made.
- [guardrails] Trigger: a guardrail test fails. Rule: do not weaken guardrail tests, fixtures, or regexes to make validation pass; fix the violating code. Verify: targeted guardrail test and `pnpm run verify` pass.
- [mui] Trigger: editing React/MUI components. Rule: read the UI way docs and use the narrowest matching MUI skill before editing. Verify: final implementation follows the component vocabulary and layer rules.
```

### Bad examples:

```markdown
- Fixed dashboard filter bug.
- Remember to be careful with tests.
- Vitest was failing because of a mock.
- We decided to improve the UI later.
```

- [ ] Run `prettier` on updated files.
