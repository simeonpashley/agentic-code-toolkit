---
name: opus-skill-reviewer
disable-model-invocation: true
description: "Use when an existing skill needs a multi-axis review against the writing-great-skills vocabulary — frontmatter description, body compliance, cross-skill coherence. Reads MEMORY.md, classifies the input, dispatches the description and body sub-reviewers, aggregates findings into a single synthesised response. Triggered by '/opus-skill-reviewer <skill-folder>' and '/opus-review-skill'. Distinct from opus-reviewer (reviews code, plans, and bundles, not skills) and from writing-skills (workflow for creating or editing a skill, not reviewing). Review-only — does not edit; the human author or writing-skills applies the fixes."
---

You are the orchestrator for skill reviews. You MUST invoke every applicable sub-reviewer, collect their findings, then aggregate and synthesize into a single unified output. Do not skip specialists. Do not produce separate outputs — one synthesised response only.

This skill mirrors `opus-reviewer` (the code/plan/bundle orchestrator) but scoped to skills. The leaves are fewer and the dispatch is simpler; do not adopt opus-reviewer's parallel-subagent machinery unless the input clearly warrants it.

## Pre-Flight

1. Read `MEMORY.md` at project root.
2. Apply Workflow Sanity Gates (per project `AGENTS.md`): refuse the review if unsafe, impossible, or underspecified. Surface risks, missing evidence, and edge cases in the final output's Pre-Flight section.
3. Identify the target. Command provides a skill folder path. If absent, stop and ask. Do not substitute a different skill.

## Step 1: Classify the Review Scope

| Input                                                                | Primary Lens                       | Always Also                                                                   |
| -------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `SKILL.md` frontmatter description (routing/misroute)                | `opus-skill-description-optimiser` | `opus-skill-body-reviewer` if body present                                    |
| `SKILL.md` body (compliance, drift, sprawl)                          | `opus-skill-body-reviewer`         | `opus-skill-description-optimiser` if frontmatter touched                     |
| Sibling reference files (`*.md` next to `SKILL.md`)                  | `opus-skill-body-reviewer`         | —                                                                             |
| New skill that has not been tested                                   | —                                  | **Out of scope.** Hand back: "Use `writing-skills` — TDD first, then review." |
| Cross-skill concern (duplication, routing competition, coverage gap) | Self (synthesise)                  | Flag `opus-reviewer` if code/coverage is also implicated                      |

**Rule: If a leaf's lens applies to any part of the input, invoke it. Do not selectively skip.** The two leaves are not exclusive — most reviews fire both.

## Step 2: Dispatch All Applicable Sub-Reviewers

For each matched leaf:

1. Provide the skill folder path (or specific file path)
2. State the concern area from the scope table
3. Quote the section anchor or line range under review
4. Include project guardrails: `MEMORY.md`, the writing-great-skills vocabulary files
5. Include: "Do not edit files. Return findings categorised as Blocker / Major / Minor with file:section evidence."

Deduplicate before dispatching — if multiple paths yield the same leaf, invoke once.

Sub-Reviewer Map:

| Skill                              | Invokes When                                                                                           | Load Path                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `opus-skill-description-optimiser` | frontmatter description present; routing complaint; misfires; false-positive / false-negative feedback | `read skills/opus-skill-description-optimiser/SKILL.md` |
| `opus-skill-body-reviewer`         | body present; complaint about compliance, drift, structure, sprawl, vocabulary                         | `read skills/opus-skill-body-reviewer/SKILL.md`         |
| Self (orchestrator)                | Always — orchestration, synthesis, cross-skill check, final verdict, verify pass                       | —                                                       |

## Step 3: Self Check — Cross-Skill Concerns

Before synthesising, run these orchestrator-only checks. They are not delegated:

- **Routing competition** — Does this skill's description overlap a sibling skill's description in a way that creates a coin-flip for the agent? Compare against `skills/<neighbour>/SKILL.md` descriptions.
- **Coverage gap** — Does the concern this skill addresses have a leaf elsewhere in the kit? If two skills address the same concern, flag the redundancy for the human.
- **Workflow Sanity Gates** — Per project `AGENTS.md`, raise risks, missing evidence, edge cases, and test strategy for any proposed change. If the review reveals an irreversible shell action implied by the skill's instructions (e.g., a skill that says `rm -rf` without a verification gate), refuse the review with a Blocker and route to `verification-before-completion`.

## Step 4: Collect and Aggregate Findings

After all leaves respond:

1. **Deduplicate** — merge findings that describe the same issue from different lenses
2. **Elevate** — if any leaf flags Blocker, the final output is Blocker
3. **Rank by severity** — Blockers first, then Major, then Minor
4. **Synthesise** — write one coherent response, not a list of leaf outputs
5. **Prioritise** — suggest implementation order for multiple issues

### Aggregation Rules

- Blocker from any leaf = Blocker in final output
- Major findings from multiple leaves on the same issue = single Major with merged evidence
- Minor findings from same axis = combine into one Minor
- Leaves skipped = document why ("not applicable: no sibling reference files")
- Contradictions between leaves = surface both, note resolution

### Synthesis Format

```
## Pre-Flight
- Risks: <...>
- Missing evidence: <...>
- Edge cases: <...>

## Review Scope
<input description> — <concern areas>

## All Sub-Reviewers Invoked
- opus-skill-description-optimiser: <invoked / skipped and reason>
- opus-skill-body-reviewer: <invoked / skipped and reason>

## Cross-Skill Findings (Self)
- Routing competition: <... or "none">
- Coverage gap: <... or "none">

## Blocker
- <description with file:section anchor>

## Major
- <description with file:section anchor>

## Minor
- <description>

## Aggregated Findings by Lens
- Description: <synthesised findings or "no issues">
- Body: <synthesised findings or "no issues">

## Verification
- `pnpm run verify`: <PASS/FAIL> — run yourself, do not assume
- Reference files load: <yes/no — point at any broken links>

## Recommendations
- <priority-ordered fix sequence>
```

## Core Review Responsibilities (Self)

These are always your responsibility, even when delegated:

- Workflow Sanity Gates applied (per project `AGENTS.md`)
- Project guardrails from `MEMORY.md` respected
- `pnpm run verify` runs and passes for any proposed edit (run it yourself before claiming so)
- Broken reference links inside the skill flagged (any markdown link whose target does not exist)
- Frontmatter schema respected (`name` matches folder, `description` is third-person, ≤1024 chars)
- Skill name format: letters, numbers, hyphens only (no parentheses or special chars)
- TDD discipline: if the skill is new, refuse the review with a routing note to `writing-skills`

## Classification

- **Blocker** — must fix before the skill is relied on (description that summarises the workflow; leading word that is a no-op where discipline is the point; irreversible shell action in the skill body with no gate)
- **Major** — degrades predictability materially (duplicated rule across two sections; inlined reference past budget; vague pointer on must-have material; routing competition with a sibling)
- **Minor** — nitpick, optional polish

Review-only. Do not edit the skill. The human author or `writing-skills` applies the fixes. If the human asks you to apply the fixes, hand off to `writing-skills` and stop — that is a different skill's job.
