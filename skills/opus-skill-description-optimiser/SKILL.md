---
name: opus-skill-description-optimiser
disable-model-invocation: true
description: "Use when the description field of a SKILL.md frontmatter needs to be rewritten so an agent invokes the skill for the right user intents without overfitting to narrow examples. Applies when creating, auditing, or improving skills, especially after false-positive, false-negative, or unclear-routing feedback. Focuses on concise intent-led trigger language, competitive distinctiveness against neighbouring skills, and exclusion boundaries. Do not use for general copy editing, marketing blurbs, or rewriting the full skill body unless the user asks to change the skill itself."
---

# Skill Description Optimiser

Use this skill when improving the `description` field in an agent skill's `SKILL.md` frontmatter.

The description is the main routing signal an agent sees before deciding whether to load a skill. It appears alongside the skill title in the agent's available skills list. The agent usually decides whether to invoke the skill from the title and description alone, before reading the full skill body.

Your task is to write a description that increases correct skill invocation:

- Trigger for relevant user intents.
- Avoid triggering for adjacent but irrelevant tasks.
- Stay concise enough to fit comfortably within routing context.
- Generalise from examples and failures without becoming a long query list.

## Inputs

The user may provide any combination of:

- The current skill title.
- The current skill description.
- The full `SKILL.md`.
- Examples of queries that should trigger the skill.
- Examples of queries that should not trigger the skill.
- Triggering failures, such as false positives or false negatives.
- Related skills that compete for routing attention.

If the user provides incomplete inputs, make the best possible improvement from what is available. Ask a clarifying question only when the target skill's purpose is materially ambiguous.

## Core Objective

Rewrite the skill description so that another agent can quickly decide when to load the skill.

Optimise for routing accuracy, not promotional clarity. The description should describe the user's intent and the situations where the skill is useful. It should avoid implementation detail unless that detail changes routing decisions.

## Description Rules

Write descriptions using these rules:

1. Start with imperative trigger language, usually "Use this skill to..." or "Use when...".
2. Describe the user's goal, task type, or decision context.
3. Include meaningful boundaries for when not to use the skill if confusion is likely.
4. Prefer broad intent categories over lists of example prompts.
5. Avoid overfitting to individual eval cases.
6. Make the skill distinctive relative to neighbouring skills.
7. Keep the description between 100 and 200 words when possible.
8. Stay comfortably below 1024 characters.
9. Use specific nouns and verbs rather than generic claims like "helps with workflows".
10. Do not describe internal mechanics unless they are relevant to skill selection.
11. **Front-load the skill's leading word.** The leading word (a pretrained concept like _red_, _fog of war_, _lesson_) is what anchors invocation in the description. Lead with it; do not bury it after setup prose. Word the description with the same leading words used in the skill body and the prompts/docs that should fire it — shared language across the three sites sharpens routing.
12. **One trigger per branch.** Synonyms that rename a single branch are duplication — "build features using TDD … asks for test-first development" is one branch written twice. Collapse them; keep only genuinely distinct branches. Distinct branches are ones a routing decision could go either way on, not ones you could swap for each other.
13. **Cut identity already in the body.** The description earns its place by triggering routing; the body covers what the skill _is_. If a sentence says what the skill does (rather than when to reach for it), move it to the body or drop it. Keep the description to triggers, plus any "when another skill needs to reach this…" clause for inter-skill routing.

For the formal model behind these rules (description as **context pointer**, **context load**, **leading words**, **premature completion** of a routing decision), see [writing-skills/writing-great-skills.md](../writing-skills/writing-great-skills.md) and its glossary.

## Handling Failure Examples

When given false positives or false negatives:

1. Identify the broader routing pattern behind each failure.
2. Convert that pattern into concise trigger or exclusion language.
3. Avoid adding every individual query to the description.
4. Preserve generality unless a specific boundary is essential.
5. If repeated failures persist, vary sentence structure and framing rather than only adding more qualifiers.

Examples of useful generalisations:

- From "did not trigger for requests to fix PR review comments", generalise to "Use when addressing actionable pull request review feedback".
- From "triggered for generic GitHub questions", generalise to "Do not use for general repository orientation or issue triage unless review comments need changes implemented".
- From "triggered for simple PDF reading", generalise to "Use for multi-step PDF transformation or extraction workflows, not simple file inspection".

## Output Format

Unless the user asks for alternatives or explanation, respond with only the improved description text.

Do not include markdown, headings, analysis, bullets, quotation marks, or commentary in the final description.

## Quality Checklist

Before finalising, check that the description:

- Makes the skill's intended trigger condition clear in the first sentence.
- Describes user intent rather than implementation.
- Covers both positive and negative routing boundaries where needed.
- Is concise enough for repeated injection into agent context.
- Avoids long enumerations of specific prompts.
- Does not duplicate the full skill body.
- Would still work for unseen but similar user requests.
- Is not so broad that it competes with unrelated skills.

## Adjacent Agent Delegation

This skill is invoked as a **leaf** by `opus-skill-reviewer` (the multi-axis skill-review orchestrator). When the orchestrator dispatches:

- Provide the skill folder path and the frontmatter block under review.
- Receive the user's stated symptom (routing complaint, false-positive, false-negative, unclear-routing feedback) and the orchestrator's scope classification.
- Return findings in the orchestrator's severity format (Blocker / Major / Minor) so the synthesis step can aggregate with `opus-skill-body-reviewer` findings.
- Do not edit the skill. The orchestrator is review-only; the human author or `writing-skills` applies fixes.

When the description review surfaces a body problem (e.g., the description is fine but the body the description references has drifted), flag it for `opus-skill-body-reviewer` and stop — that is a different leaf's concern.
[1]: https://officialskills.sh/anthropics/skills/skill-creator?utm_source=chatgpt.com "Anthropic/skill-creator — Agent Skills - officialskills.sh"
