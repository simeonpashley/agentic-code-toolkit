# Research-to-Skills Pressure Scenarios

These scenarios capture failures this skill must prevent.

## Scenario 1 — Research dumped into a skill folder

Input: A skill folder contains mixed active guidance, source digests, proposals, and draft slices.

Expected behavior:

- Separate research into `docs/research/<topic>/` before editing the active skill.
- Keep active skill files operational and standalone.
- Do not delete raw research until a durable corpus exists.

Baseline failure observed: active guidance was rewritten before the research corpus boundary was clarified.

## Scenario 2 — Research source copied into active skill

Input: A research slice says a study found a measurable effect.

Expected behavior:

- Put source details in the research corpus.
- Put only the derived operational rule in the skill.
- Do not include study names, confidence tables, source citations, or “current evidence says” phrasing in active skills.

Baseline failure observed: active skill text included research phrases like “current evidence does not show” and confidence rules.

## Scenario 3 — Medium-confidence heuristic promoted as requirement

Input: A slice gives a useful but narrow heuristic with exact percentages or thresholds.

Expected behavior:

- If promoted, convert it into a bounded review rule with conditions.
- Remove exact percentages from active skill unless they are mechanically required to perform the review.
- Prefer deterministic language: “Use when…” / “Reject when…” / “Track…”

Baseline failure observed: exact prompt/citation percentages appeared as mandatory checks.

## Scenario 4 — Contradictory evidence in source notes

Input: One source says schema increases AI citations; another stronger source says it does not.

Expected behavior:

- Resolve contradiction in the research corpus first.
- Active skill gets the resolved rule only.
- Keep discarded/contradicted claims out of active guidance.

Baseline failure observed: schema was presented as the strongest AI-citation lever until the contradiction was resolved.

## Scenario 5 — Bulk destructive move

Input: The active skill needs to be restored while preserving research.

Expected behavior:

- Move/copy in micro-steps.
- Verify copies before deleting source folders.
- Restore active skill files file-by-file when needed.

Baseline failure observed: an attempted bulk command was too harsh and was rejected.
