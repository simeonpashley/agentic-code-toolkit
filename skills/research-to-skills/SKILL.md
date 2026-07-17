---
name: research-to-skills
description: "Use when a research corpus, source dump, proposal, audit notes, or exploratory findings need to be converted into durable skill guidance, existing skill corrections, or candidate skill splits without mixing evidence notes into active skills. Use when deciding whether findings should update a skill, stay research-only, become pressure scenarios, or justify a new focused skill."
license: Proprietary
metadata:
  version: "1.0"
---

# Research to Skills

## Purpose

Convert research into deterministic, standalone skill guidance without smuggling source notes, uncertainty, or draft analysis into active skills.

## Core Rule

```text
Research explains why.
Skills say what to do.
```

Active skills must be operational. They should not read like literature reviews.

## Workflow

1. **Separate corpus from skill**
   - Put research under `docs/research/<topic>/`.
   - Keep active skill folders for deployable guidance only.
   - Move in micro-steps; verify copies before deleting originals.

2. **Slice research narrowly**
   - One slice per topic or mechanism.
   - Resolve duplicates and overlaps inside the corpus.
   - Keep source details, links, confidence notes, contradictions, and caveats in research files.

3. **Decide promotion level**
   - Strong, stable finding → required check or severity rule.
   - Useful but bounded finding → conditional heuristic.
   - Weak, contradictory, or pressure-case finding → research-only or pressure scenario.
   - Failure mode without proof of efficacy → review scenario, not guidance.

4. **Map slices to skills**
   - For each slice, choose one outcome:
     - no action;
     - correct existing skill;
     - add deterministic check to existing skill;
     - route to adjacent skill;
     - create pressure scenario;
     - propose a new focused skill;
     - keep research-only.

5. **Write pressure scenarios before edits**
   - Capture the failure the current skill would allow.
   - State expected reviewer behavior.
   - Use scenarios to constrain the edit.

6. **Patch active skills in small batches**
   - Remove misleading or contradicted guidance first.
   - Add only standalone operational rules.
   - Do not include source names, study summaries, confidence tables, or “evidence says” phrasing.
   - Keep derived rationale only when it changes behavior.

7. **Check decomposition last**
   - Split a skill only when the candidate has distinct triggers, a reusable workflow, and enough operational rules to stand alone.
   - Do not create a new skill for a subsection that works as a checklist inside an existing skill.

## Active Skill Writing Rules

Use deterministic wording:

```text
Flag hidden schema as a blocker.
Track citation role, position, clicks, and conversion separately.
Reject generated statistics unless verified.
Move the direct answer earlier when buried intro copy blocks comprehension.
```

Avoid making active skills read like research notes:

```text
A study found...
Current evidence suggests...
Medium confidence...
Source: ...
```

## Decision Table

| Research condition              | Skill outcome                                   |
| ------------------------------- | ----------------------------------------------- |
| Contradicts active guidance     | Correct or remove active guidance               |
| Strongly supports existing rule | Tighten wording or severity example             |
| Useful only in narrow cases     | Add conditional heuristic                       |
| Unclear or conflicting          | Keep in corpus only                             |
| Describes market failure mode   | Add pressure scenario or adjacent-skill routing |
| Has distinct trigger + workflow | Consider new focused skill                      |

## Verification

Before claiming the migration is ready:

- [ ] Active skills contain no source names, study summaries, or confidence tables.
- [ ] Active skills contain no research-summary phrasing.
- [ ] Every promoted claim has a corresponding research slice or pressure scenario.
- [ ] Weak findings remain in `docs/research/<topic>/`.
- [ ] Existing skill behavior is checked with the pressure scenarios.
- [ ] Markdown formatting passes.

## Supporting Files

- `references/pressure-scenarios.md`
- `references/baseline.md`
