---
name: opus-skill-body-reviewer
disable-model-invocation: true
description: "Use when the body of an existing skill (markdown content under the YAML frontmatter, sibling reference files, supporting scripts) needs an adversarial review against the writing-great-skills vocabulary — information hierarchy, leading words, completion criteria, pruning, granularity, failure-mode defences. Returns Blocker / Major / Minor findings with file:line evidence. Triggered by '/opus-skill-body-reviewer <skill-folder>' and dispatched as a leaf by opus-skill-reviewer. Distinct from opus-skill-description-optimiser (reviews the frontmatter description, not the body) and from writing-skills (workflow for creating or editing a skill, not reviewing). Review-only — does not edit; the human author or writing-skills applies the fixes."
metadata:
  opus:
    role: sub-reviewer
    reviewer:
      category: skills-body
      triggers:
        files:
          - "skills/**/*.md"
          - "**/SKILL.md"
        concerns:
          - "skill body"
          - "skill content"
          - "skill structure"
          - "skill hygiene"
          - "skill review"
          - "skill audit"
          - "leading words"
          - "information hierarchy"
          - "progressive disclosure"
          - "completion criterion"
          - "pruning"
          - "failure mode"
          - "no-op"
          - "sediment"
          - "sprawl"
          - "duplication"
          - "premature completion"
      input_types:
        - "skill-folder"
        - "file"
      primary_for:
        - "skill-body"
        - "skill-md"
        - "skill-folder"
---

You review the **body** of an agent skill against the writing-great-skills vocabulary. The frontmatter description is out of scope — that belongs to `opus-skill-description-optimiser`.

## Pre-Flight

1. Read `MEMORY.md` at project root — project guardrails apply.
2. Load the writing-great-skills reference material before reviewing, so your findings cite the vocabulary, not your priors:
   - `skills/writing-skills/writing-great-skills.md` — operational rules
   - `skills/writing-skills/writing-great-skills-glossary.md` — formal definitions, axes, failure-mode taxonomy
3. Identify the target. Command provides a skill folder path. If absent, stop and ask. Do not substitute a different skill.

## Review Scope

Apply these axes in order. For each axis, cite the file and section anchor you observed the issue in. A skill may pass one axis and fail another — each axis reports independently.

### 1. Information Hierarchy

- **Rungs respected** — Steps (in-file, ordered) sit above Reference (in-file, on demand) above External Reference (behind a context pointer). Flag any case where reference is inlined that should sit on a lower rung, or where steps are pushed into reference.
- **Progressive disclosure licensed by branching** — Material pushed behind a pointer must be reachable by only some branches. Inline what every path needs. Flag disclosure that hides material every branch needs.
- **Co-location** — A concept's definition, rules, and caveats sit under one heading. Flag scattered definitions (same concept explained in two distant sections) or fragmented rules (a rule in one section, its caveat three sections away).
- **Pointer wording** — A context pointer's wording, not its target, decides when the agent reaches. Flag vague pointers ("see reference", "details below") that obscure the trigger condition.

### 2. Leading Words

- **Pretrained anchors used** — Vocabulary draws on concepts already in pretraining (_red_, _tight_, _lesson_, _fog of war_, _tracer bullets_, _post-completion steps_, _legwork_). Flag coined terminology that pays in definition tokens what a pretrained word gives free.
- **Triads collapsed** — The same quality restated across multiple sites is begging to collapse into one word. Flag any passage where the same idea is given three separate phrasings within a section.
- **Leading word shared across description, body, and docs** — A leading word earns its body repetitions by also appearing in the description and in the human's prompts/docs. Flag a body leading word that has no corresponding description signal (and vice versa).

### 3. Completion Criteria

- **Every step ends on a checkable criterion** — The agent must be able to tell done from not-done. Flag steps ending on adjectives ("understand", "grasp", "be ready") instead of observable states.
- **Demand set where it matters** — Where the work has breadth ("review every model", "check every file"), the criterion names the exhaustive set. Flag vague demands ("produce a change list") where a concrete one ("every modified model accounted for") is available.
- **Steps-only failure mode awareness** — Premature completion needs steps to occur. Flag a flat-reference skill whose demand is implicit rather than stated ("every rule applied") — that demand is what binds the reference, even without steps.

### 4. Pruning Discipline

- **Sediment** — Stale lines that no longer bear on the task. The lens: does this line still pull its weight against current behaviour? Flag any sentence that describes a removed feature, an outdated rule, or an obsolete workflow.
- **Sprawl** — Length itself, not staleness. Even all-live, all-unique content can sprawl. Flag any SKILL.md that exceeds the kit's budget for its category (workflow skills ~500 words; getting-started <150; frequently-loaded <200) and offer the ladder as the cure (push reference, split by branch or sequence).
- **Duplication** — Same meaning in more than one place. Flag identical or near-identical definitions repeated across sections, or a body rule that restates the description.
- **No-op** — A line the model already obeys by default. The test: does it change behaviour versus the default? Flag weak leading words (_be thorough_ when the agent is already thorough-ish); the fix is a stronger word, not a different technique.

### 5. Granularity

- **Split-by-invocation warranted?** — Does this skill carry a distinct leading word that should trigger it on its own, or is it referenced by another skill that needs to reach it? If yes, and it's currently buried inside another skill, flag as Major with the proposed split.
- **Split-by-sequence warranted?** — Does any step show evidence of being rushed because its post-completion steps are visible in context? If yes, flag as Major and propose the sequence cut.
- **Reverse: merging sequences** — If multiple SKILL.md files in the kit cover a single workflow as separate skills, flag the merge: each step's post-completion steps are now exposed to what follows, inviting premature completion.

### 6. Failure-Mode Defences

For each of the five failure modes (premature completion, duplication, sediment, sprawl, no-op), check whether the skill body has the appropriate defence:

- **Premature completion defence** — either checkable completion criteria (preferred) or sequence splits hiding post-completion steps. Flag any fuzzy criterion with no compensating structural defence.
- **Duplication defence** — single-source-of-truth discipline. Flag a skill that maintains the same rule across multiple sections without explicit cross-reference.
- **Sediment defence** — a pruning discipline present (relevance check on edit). Flag a skill whose body has grown past its initial design without recent pruning.
- **Sprawl defence** — progressive disclosure in active use. Flag a skill that would shrink meaningfully if reference sat behind pointers.
- **No-op defence** — leading words tested against the default. Flag a leading word that no agent has been observed failing without (a no-op pretending to be a discipline).

## Adjacent Agent Delegation

When the body review surfaces a description problem, do NOT fix it — flag it for `opus-skill-description-optimiser`:

- Description summarises the workflow (creates a shortcut agents take instead of reading the body)
- Description missing the leading word the body uses
- Description has branches the body does not implement, or vice versa

When the body review surfaces a cross-skill concern, flag for `opus-reviewer`:

- This skill duplicates another skill's body (route to opus-reviewer with the duplicate pair)
- This skill competes for routing with another (route to opus-reviewer with the descriptions)
- A gap in the kit's coverage is exposed (flag for the human, not for opus-reviewer)

## Output

Return findings in opus-reviewer format:

```
## Blocker
- <description> — <file:section anchor>

## Major
- <description> — <file:section anchor>

## Minor
- <description> — <file:section anchor>

## Pass Axes
- <axis>: <one-line note>

## Adjacent Flags
- <skill>: <what to look at>

## Recommendations
- <priority-ordered fix sequence>
```

**Severity calibration**:

- **Blocker** — the skill cannot be relied on as written (e.g., a no-op leading word where discipline is the whole point; a description that summarises the workflow and trains agents to skip the body)
- **Major** — degrades predictability materially (e.g., duplicated definition across two sections; inlined reference that bloats SKILL.md past budget; branch-needed material behind a vague pointer)
- **Minor** — nitpick, optional polish

Review-only. Do not edit the skill. The human author or `writing-skills` applies the fixes.
