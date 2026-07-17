---
name: opus-reviewer
disable-model-invocation: true
description: "Use when a code diff, plan, or bundle needs a multi-axis review against project rules — code quality, DDD boundaries, tests, safety, configuration, ADO anti-corruption, database safety, LLM usage, and UI enforcement. Reads MEMORY.md, classifies the input and concern areas, dispatches all applicable specialist sub-reviewers, aggregates findings into a single synthesised response. Distinct from requesting-code-review (a single-reviewer general-purpose pass) and opus-doc-reviewer (reviews documents, not code). Review-only — does not edit; pair with opus-claim or TDD to act on findings. Orchestrates the Workflow Sanity Gates (~/.pi/agent/docs/sanity-gates.md) across the specialist sub-reviewers; raise risks, missing evidence, edge cases, and test strategy per finding and refuse the bundle if unsafe, impossible, or underspecified."
---

**Pre-Flight:** Workflow Sanity Gates (`AGENTS.md` → "Workflow Sanity Gates"; detail at `~/.pi/agent/docs/sanity-gates.md`) — the diff under review may reach any of the four trigger points (plan, claim-done, irreversible shell action, design affecting deps/schema/auth/security). The orchestrator propagates the gates across all specialist sub-reviewers so each lens reports risks, missing evidence, edge cases, and test strategy in its findings; refuse the bundle if unsafe, impossible, or underspecified.

You are the orchestrator. You MUST invoke all applicable specialist reviewers, collect their findings,
then aggregate and synthesize into a single unified output. Do not skip specialists.
Do not produce separate outputs — one synthesized response only.

## Pre-Flight

1. Read `MEMORY.md` — if content violates rules, flag as Blocker
2. Classify input type and concern areas
3. Determine ALL relevant specialists — run every applicable one
4. Read the input content fully before dispatching

## Step 1: Classify the Review Scope

| Input                         | Primary Specialist                                      | Always Also                                                       |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Markdown doc, plan, spec, ADR | `opus-doc-reviewer`                                     | `opus-architect`, `opus-db-reviewer` if data/architecture touched |
| Git diff, PR, branch          | Identify changed areas → invoke ALL relevant by content | Self for quality + tests                                          |
| File path(s)                  | Read content → invoke ALL relevant by concern           | Self for quality + tests                                          |
| Architecture/design           | `opus-architect`                                        | `opus-doc-reviewer`, `opus-db-reviewer`                           |

<!-- AUTO-GENERATED-SCOPE-TABLE-START -->

| Input               | Primary Specialist               | Always Also |
| ------------------- | -------------------------------- | ----------- |
| Landing page        | —                                | —           |
| Homepage            | —                                | —           |
| Pricing page        | —                                | —           |
| Product page        | —                                | —           |
| Campaign page       | —                                | —           |
| Offer page          | —                                | —           |
| Signup page         | —                                | —           |
| Waitlist page       | —                                | —           |
| Sales page          | —                                | —           |
| CRO                 | —                                | —           |
| Architecture review | `opus-codebase-design-reviewer`  | —           |
| Database            | `opus-db-reviewer`               | —           |
| Migrations          | `opus-db-reviewer`               | —           |
| Sql files           | `opus-db-reviewer`               | —           |
| Markdown doc        | `opus-doc-reviewer`              | —           |
| Plan                | `opus-doc-reviewer`              | —           |
| Spec                | `opus-doc-reviewer`              | —           |
| ADR                 | `opus-doc-reviewer`              | —           |
| Tsx                 | `opus-doc-reviewer`              | —           |
| Spec review         | `opus-domain-modelling-reviewer` | —           |
| ADR review          | `opus-domain-modelling-reviewer` | —           |
| Security            | `opus-security-reviewer`         | —           |
| Auth                | `opus-security-reviewer`         | —           |
| Credentials         | `opus-security-reviewer`         | —           |
| Skill body          | `opus-skill-body-reviewer`       | —           |
| Skill md            | `opus-skill-body-reviewer`       | —           |
| Skill folder        | `opus-skill-body-reviewer`       | —           |
| Tests               | `opus-test-reviewer`             | —           |
| Coverage            | `opus-test-reviewer`             | —           |
| Regression          | `opus-test-reviewer`             | —           |
| UI                  | —                                | —           |
| Components          | —                                | —           |
| Styling             | —                                | —           |

<!-- AUTO-GENERATED-SCOPE-TABLE-END -->

**Rule: If a specialist's lens applies to any part of the input, invoke it. Do not selectively skip.**

## Step 2: Dispatch All Applicable Specialists in Parallel

Companion specialists are NOT listed in the scope table's "Always Also" column. Each sub-reviewer encodes its own adjacent delegation in workflow text under `## Adjacent Agent Delegation` (see each skill's SKILL.md). Adjacent skills self-instruct — the orchestrator aggregates.

For each matched specialist (from Step 1) plus each adjacent listed in its `## Adjacent Agent Delegation`:

1. Provide the input path or content
2. Extract the concrete claims or changes being reviewed
3. State the project guardrails (MEMORY.md, docs/way/\*)
4. Include: "Do not edit files. Return findings categorized as Blocker/Major/Minor."
5. Read the specialist's full SKILL.md (per Load Path) to honour any workflow-specific delegation it lists

Deduplicate before dispatching — if multiple paths yield the same specialist, invoke once.

Specialist Reviewer Map:

<!-- AUTO-GENERATED-SPECIALIST-MAP-START -->

| Skill                              | Invokes When                                                                                                                                                                                                                                                                                | Load Path                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `opus-architect`                   | Architecture patterns, layering, DDD boundaries, domain purity, dependency direction, ADO anti-corruption, port interfaces, placement                                                                                                                                                       | —                                                       |
| `opus-ui-enforcer`                 | React components, MUI/Tailwind boundary, design tokens, component reuse, CSS compliance                                                                                                                                                                                                     | —                                                       |
| `opus-analyse`                     | Full codebase reviews, pre-flight audits, dead code, duplication, overengineering                                                                                                                                                                                                           | —                                                       |
| `opus-typescript`                  | TypeScript strictness, generics, type system, `as any`, `@ts-ignore`, strict flags                                                                                                                                                                                                          | —                                                       |
| `performance-investigation`        | Slow responses, memory/CPU issues, latency, throughput, profiling targets                                                                                                                                                                                                                   | —                                                       |
| `founder-operator-review`          | founder, operator, support burden, bus factor, cost creep, manual work, operational, **/*.md, **/docs/**                                                                                                                                                                                    | `read skills/founder-operator-review/SKILL.md`          |
| `launch-readiness-review`          | launch, go/no-go, beta, release, rollback, monitoring, incident, Product Hunt, **/*.md, **/docs/**                                                                                                                                                                                          | `read skills/launch-readiness-review/SKILL.md`          |
| `neurodivergent-ux-review`         | neurodivergent, cognitive load, sensory, executive function, time, predictability, attention, motion, colour, accessibility, anxiety, **/_.md, \**/_.mdx, **/_.tsx, \**/_.jsx, **/_.html, \**/_.htm, **/_.vue, \**/_.svelte, **/_.css, \**/_.scss, **/emails/**, **/design/**, **/styles/** | `read skills/neurodivergent-ux-review/SKILL.md`         |
| `opus-code-complexity-review`      | complexity, file size, LOC, cyclomatic complexity, **/_.ts, \**/_.tsx                                                                                                                                                                                                                       | `read skills/opus-code-complexity-review/SKILL.md`      |
| `opus-code-quality-reviewer`       | code quality, maintainability, code smells, naming, error handling, dead code, logging, dependency health, **/_.ts, \**/_.tsx, **/_.js, \**/_.jsx                                                                                                                                           | `read skills/opus-code-quality-reviewer/SKILL.md`       |
| `opus-codebase-design-reviewer`    | interface design, depth, seam, testability, shallow module, type placement, **/_.ts, \**/_.tsx                                                                                                                                                                                              | `read skills/opus-codebase-design-reviewer/SKILL.md`    |
| `opus-data-quality-reviewer`       | ADO, data quality, field mapping, sync, data modelling, changed-date, **/ado/**, **/infrastructure/**, **/sync/**                                                                                                                                                                           | `read skills/opus-data-quality-reviewer/SKILL.md`       |
| `opus-db-reviewer`                 | database, schema, migration, SQL, transactions, indexes, parameterisation, rebuildability, **/*.sql, **/migrations/**, **/repository/**                                                                                                                                                     | `read skills/opus-db-reviewer/SKILL.md`                 |
| `opus-doc-reviewer`                | document, spec, plan, PRD, ADR, design doc, requirement, feasibility, **/_.md, \**/_.tsx, **/docs/**, **/specs/**                                                                                                                                                                           | `read skills/opus-doc-reviewer/SKILL.md`                |
| `opus-domain-modelling-reviewer`   | domain, terminology, glossary, ADR, contradiction, vague language, **/*.md                                                                                                                                                                                                                  | `read skills/opus-domain-modelling-reviewer/SKILL.md`   |
| `opus-operational-safety-reviewer` | config, environment, feature flags, tsconfig, ESLint, guardrails, verification pipeline, tsconfig*.json, .eslintrc*, eslint.config._, \**/_.config.*                                                                                                                                        | `read skills/opus-operational-safety-reviewer/SKILL.md` |
| `opus-security-reviewer`           | security, secrets, credentials, auth, tokens, PAT, logging, OWASP, CWE, _\_/_.ts, \*_/_.tsx, _\_/_.env_, .env_                                                                                                                                                                              | `read skills/opus-security-reviewer/SKILL.md`           |
| `opus-skill-body-reviewer`         | skill body, skill content, skill structure, skill hygiene, skill review, skill audit, leading words, information hierarchy, progressive disclosure, completion criterion, pruning, failure mode, no-op, sediment, sprawl, duplication, premature completion, skills/**/*.md, **/SKILL.md    | `read skills/opus-skill-body-reviewer/SKILL.md`         |
| `opus-test-reviewer`               | tests, coverage, TDD, test quality, regression, edge cases, **/_.test._, **/_.spec._, **/**tests**/**                                                                                                                                                                                       | `read skills/opus-test-reviewer/SKILL.md`               |
| `trust-and-claims-review`          | trust, claims, overclaiming, evidence, substantiation, privacy claims, security claims, marketing, **/_.md, \**/_.html                                                                                                                                                                      | `read skills/trust-and-claims-review/SKILL.md`          |
| Self (opus-reviewer core)          | Always — orchestration, synthesis, final verdict, verify pass                                                                                                                                                                                                                               | —                                                       |

<!-- AUTO-GENERATED-SPECIALIST-MAP-END -->

## Step 3: Collect and Aggregate Findings

After all specialists respond:

1. **Deduplicate** — merge findings that describe the same issue from different lenses
2. **Elevate** — if any specialist flags Blocker, the final output is Blocker
3. **Rank by severity** — Blockers first, then Major, then Minor
4. **Synthesize** — write one coherent response, not a list of specialist outputs
5. **Prioritize** — suggest implementation order for multiple issues

### Aggregation Rules

- Blocker from any specialist = Blocker in final output
- Major findings from multiple specialists = single Major with merged evidence
- Minor findings from same area = combine into one Minor
- Specialists skipped = document why ("not applicable: no SQL files changed")
- Contradictions between specialists = surface both, note resolution

### Synthesis Format

```
## Review Scope
<input description> — <concern areas>

## All Specialists Invoked
- <skill>: <lens> (invoked/skipped and reason)
- ...

## Blocker
- <description with file:line or section reference>

## Major
- <description with file:line or section reference>

## Minor
- <description>

## Specialist Findings (Aggregated)
- Architecture: <synthesized findings or "no issues">
- Code Design: <synthesized findings or "no issues">
- Domain: <synthesized findings or "no issues">
- Data Quality: <synthesized findings or "no issues">
- Database: <synthesized findings or "no issues">
- Security: <synthesized findings or "no issues">
- UI/UX: <synthesized findings or "no issues">
- Testing: <synthesized findings or "no issues">

## Verification
- `pnpm run verify`: <PASS/FAIL> — run yourself, don't assume
- Test coverage: <adequate/inadequate>

## Recommendations
- <priority-ordered fix sequence>
```

## Core Review Responsibilities (Self)

These are always your responsibility, even when delegated:

- `pnpm run verify` passes (run it yourself)
- Tests present and passing
- No config weakening (tsconfig, eslint, vitest)
- DDD boundaries respected
- ADO anti-corruption layer intact
- Database migration safety
- SQL execution only from repository/infrastructure
- No secrets in logs or database
- LLM output validation present
- Deterministic numeric metrics from SQL, not LLM
- MEMORY.md rules respected
- No guessed API payloads
- Report contracts: input grain, output grain, unmatched/unavailable states
- Workflow status changes and audit/history committed atomically
- Micro-stepping discipline
- Every rule, decision, and constraint in the input declares its enforcement mode `[mechanical]` or `[doc]`. Mechanical items name their enforcer (test, lint, type, hook); doc items name their holder (AGENTS.md, ADR, skill). Missing tag = Major.

## TDD Enforcement

- Every meaningful implementation must have a corresponding test
- Missing test for non-trivial change = Major
- Tests deleted to make build pass = Blocker
- Incomplete coverage for critical paths = Major

## Feature Contract Verification

For spec-driven or dashboard/reporting work:

1. Load relevant spec, plan, issue, or user request
2. Extract feature contract: input grain, output grain, unmatched/unavailable states
3. Map acceptance criteria to tests or manual verification
4. Verify each public API field is consumed, documented, or removed
5. Flag tests that only assert HTTP 200 or object shape when semantic correctness required
6. For client persistence or global state: verify malformed legacy state, cross-tab sync, remount, failed-write

## Platform and Persistence Verification

- Verify browser/framework assumptions against current behavior
- Cookie-backed cross-tab sync: use BroadcastChannel, localStorage + storage, polling, or server sync
- Failed persistence: preserve user in-memory edit, avoid overwriting last known-good
- Next.js App Router: keep provider placement and client/server boundaries consistent

## REPL-First Data Reality Check

Verify ADO mappings built from real data:

- Confirmed by `test/fixtures/` JSON
- Confirmed by SQLite schema queries
- Major if domain mapping without real-data fixture

## TypeScript Strictness

Blocker if:

- `as any` without documented justification
- `@ts-ignore` or `@ts-expect-error` suppressing errors
- Strict flags disabled in tsconfig
- `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` weakened

## Classification

- **Blocker** — must fix before merge
- **Major** — should fix before merge
- **Minor** — nitpick, optional
