---
name: writing-plans
description: |
  "Use when a spec, requirements doc, or approved design exists and the next step is producing a repository-grounded, bite-sized implementation plan before any code is written. Generates docs/plans/YYYY-MM-DD-feature.md with one-shot executable phases, phase gates, TDD-shaped tasks, red-green-refactor checkpoints, frequent commits, explicit file structure, requirements traceability, command grounding, enforcement tagging, and per-task Workflow Sanity Gates fields. Written for an executor with no prior repository context. Hands off to executing-plans in the same session. Do not use for design generation, brainstorming, single-file edits, or work that skips the spec step."
---

# Writing Plans

## Required opening announcement

At the start of the response, say exactly:

"I'm using the writing-plans skill to create the implementation plan."

## Purpose

Write a complete implementation plan from an approved detail spec.

The output is a repository-grounded execution contract. It must be specific enough that a technically competent executor with no prior repository context can implement it task by task, with tests, verification commands, explicit file paths, phase gates, commit boundaries, and known risks.

The plan may be split into phases, but phases are execution structure, not assumed user checkpoints. Default to a one-shot executable plan that can be handed to downstream agents and completed without the original planner or user returning.

Prioritise:

- DRY
- YAGNI
- TDD
- focused files
- explicit interfaces
- frequent commits
- mechanical verification
- safe sequencing
- clear parallelisation boundaries
- realistic assumptions grounded in repository evidence

Save plans to:

`docs/plans/YYYY-MM-DD-<feature-name>.md`

## Pre-Flight: Workflow Sanity Gates

Read and apply the Workflow Sanity Gates from:

- `AGENTS.md` -> "Workflow Sanity Gates"
- `~/.pi/agent/docs/sanity-gates.md`

Every plan task that will run an irreversible shell command or affect a dependency, schema, authentication, authorisation, payment, fulfilment, customer data, privacy, or security-relevant surface is a downstream trigger point.

Plans produced by this skill must carry the gates' fields per task so the executing session has them ready at each trigger point.

Refuse to produce the plan if the work is unsafe, impossible, or underspecified in a way that would risk data integrity, security, production stability, irreversible changes, or incompatible architecture.

## Input Sufficiency Check

Before planning, verify that the input spec contains enough detail to implement safely.

Check for:

- user-visible behaviour
- acceptance criteria
- non-goals
- data model changes, if any
- API changes, if any
- UI changes, if any
- error behaviour
- edge-case behaviour
- security implications
- privacy implications
- dependency implications
- migration or rollout constraints, if any
- test expectations or quality bar
- observability, logging, or monitoring requirements, if relevant

If one or two minor details are missing, continue with explicit assumptions.

Do not ask questions for details that can be resolved by inspecting the repository, following existing conventions, or making a low-risk documented assumption.

Ask the user questions only when the answer materially changes the implementation plan and cannot be safely inferred from the spec or repository evidence.

When clarification is required:

- ask the minimum number of questions
- group related questions together
- state why each answer is blocking
- do not write a speculative plan when the missing answer affects security, data integrity, irreversible operations, public API shape, customer-visible behaviour, or product policy

For non-blocking gaps, continue with an explicit assumption and record it in "Assumptions and Evidence".

## Stop Conditions

Do not produce an implementation plan when:

- the requested behaviour is still design-level rather than implementation-ready
- the spec conflicts with repository constraints
- the plan would require credentials, secrets, production access, or destructive commands that cannot be safely validated
- the required data model or API contract is missing
- security, privacy, compliance, payment, fulfilment, or authorisation behaviour is ambiguous
- the work spans independent subsystems that cannot be delivered as one working, testable increment
- repository evidence contradicts the spec in a way that requires a product or architecture decision
- dependency, licence, migration, or rollout risk requires approval that has not been provided

When stopping, produce:

- a short blocking-issues list
- the minimum questions or spec changes required to proceed
- any safe partial planning that remains valid

## One-Shot Bias

Assume the generated plan may be executed in a single downstream session without the original planner or user returning.

Therefore:

- include all phases in one document
- include all known gates in one document
- prefer continue gates over stop gates
- make assumptions explicit rather than leaving open questions inside later phases
- avoid instructions such as "confirm later", "decide after Phase 1", or "ask the user before Phase 2" unless the gate is explicitly marked as a stop gate
- ensure each phase can be executed from the document alone, using repository evidence and prior phase outputs
- isolate any required user interaction to explicit stop gates

## Execution Mode

Default to a one-shot executable plan.

The plan may be split into phases when that improves sequencing, validation, reviewability, risk control, or parallelisation.

Each phase gate must be one of:

- **Continue gate:** the executor proceeds automatically when the listed checks pass.
- **Stop gate:** the executor must pause and ask the user before continuing.

Use stop gates only when continuation requires a product decision, unresolved requirement, destructive action, security-sensitive choice, data migration approval, dependency approval, licence approval, external credential, access decision, or public API decision.

Most gates should be continue gates.

Phase gates are not retrospective summaries. They are executable checks.

A valid gate names:

- the exact command or inspection to perform
- the expected pass condition
- the failure condition that blocks continuation
- whether the executor may continue without user input

A gate that only says "review before continuing" is invalid unless it is marked as a stop gate and names the decision required from the user.

## Repository Reconnaissance

Before writing the plan, inspect the repository enough to ground every file path, command, framework assumption, and naming convention.

Required evidence:

- read `AGENTS.md`
- read package manifests
- read test configuration
- read build configuration
- read lint and formatter configuration
- read relevant existing modules
- read comparable implementations
- read comparable tests
- identify the test runner
- identify the type-checker
- identify the linter
- identify the formatter
- identify normal commit style from recent history if available
- identify whether the planned work fits existing architecture or requires a new module boundary

The plan must not invent:

- file paths
- package scripts
- test framework APIs
- framework conventions
- type names
- function names
- migration commands
- deployment commands
- line numbers
- repository-specific patterns

If a required fact cannot be verified from the repository or spec, record it under "Missing Evidence" and either choose a safe fallback or stop.

## Scope Check

If the spec covers multiple independent subsystems, it should normally have been broken into sub-project specs during brainstorming.

If it was not, choose one of these paths:

1. If the subsystems can be delivered as one working, testable increment, create one phased plan with explicit phase gates and collision controls.
2. If the subsystems are independently deliverable and would create avoidable collision or review risk, suggest breaking the work into separate plans, one per subsystem.
3. If the subsystems require unresolved product or architecture decisions, stop and ask the minimum blocking questions.

Each plan should produce working, testable software on its own.

## Plan Document Header

Every plan must start with this header:

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds.]

**Architecture:** [2-3 sentences about the implementation approach, repository fit, and main boundaries.]

**Tech Stack:** [Key technologies, frameworks, libraries, test tools, and runtime assumptions.]

**Execution Mode:** One-shot executable plan with internal phase gates.

**Enforcement Mode:** Every rule, decision, and constraint below is tagged with its enforcement mode:

- `[mechanical]` - enforced by a named test, lint rule, type-check, build check, migration dry-run, or pre-commit hook
- `[doc]` - enforced only by being stated in a named holder, such as this plan, the spec, AGENTS.md, or an ADR

---
```

## Assumptions and Evidence

Every plan must include this section before file structure.

```markdown
## Assumptions and Evidence

| Assumption   | Evidence                          | Confidence      | Impact if wrong |
| ------------ | --------------------------------- | --------------- | --------------- |
| [Assumption] | [Spec section or repository file] | High/Medium/Low | [Consequence]   |
```

Rules:

- only high-confidence assumptions may drive file paths, commands, or public interfaces
- medium-confidence assumptions must be isolated to a task and called out in "Missing Evidence"
- low-confidence assumptions must not be used for implementation planning
- if a low-confidence assumption is required to continue safely, stop and ask a blocking question

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for.

This is where decomposition decisions get locked in.

```markdown
## File Structure

| Path                    | Action        | Responsibility                | Enforcement                          |
| ----------------------- | ------------- | ----------------------------- | ------------------------------------ |
| `exact/path/to/file.ts` | Create/Modify | [Single clear responsibility] | [mechanical] Enforced by `tests/...` |
```

Rules:

- use exact file paths
- identify create, modify, delete, or move actions
- include test files alongside production files
- include docs, migrations, config, and fixture files if relevant
- design units with clear boundaries and well-defined interfaces
- prefer smaller, focused files over large files that do too much
- keep files that change together close together
- split by responsibility, not by technical layer alone
- in existing codebases, follow established patterns
- do not unilaterally restructure unrelated code
- if a file being modified has grown unwieldy, include a focused split only when it directly reduces risk for this feature

The file structure informs task decomposition. Each task should produce a self-contained, reviewable change.

## Requirements Traceability

Every plan must include a visible requirements traceability matrix before the phases.

```markdown
## Requirements Traceability

| Requirement       | Source         | Implemented by     | Verified by               | Enforcement  |
| ----------------- | -------------- | ------------------ | ------------------------- | ------------ |
| R1: [Requirement] | [Spec section] | Task 1.1, Task 1.2 | `tests/path/test_file.ts` | [mechanical] |
```

Rules:

- every requirement in the spec must map to at least one task
- every requirement must map to at least one verification method
- if a requirement is intentionally not implemented, list it as a non-goal and cite the source
- acceptance criteria must map to mechanical checks whenever feasible
- doc-only enforcement must name the holder, such as the spec, this plan, AGENTS.md, or an ADR

## Phase Structure

Use phases when they improve sequencing, risk control, validation, or parallelisation.

Every phase must use this structure:

```markdown
## Phase N: [Phase Name]

**Purpose:** [What this phase makes true.]

**Entry Criteria:**

- [mechanical/doc] [Precondition required before starting this phase. Name the enforcer or holder.]

**Tasks:**

- Task N.1: [Task name]
- Task N.2: [Task name]

**Gate Type:** Continue gate | Stop gate

**Gate Checks:**

- [mechanical] Run `[command]` from `[working directory]`; expected pass condition: `[result]`.
- [mechanical] Run `[command]` from `[working directory]`; expected pass condition: `[result]`.
- [doc] Inspect `[file or artefact]`; expected condition: `[result]`.

**Proceed Rule:**

- For a continue gate: proceed to the next phase only if all mechanical checks pass and no listed risk has materialised.
- For a stop gate: pause after completing the checks and ask the listed question or request the listed approval.
```

Continue gate examples:

- unit tests pass
- integration tests pass
- type-check passes
- lint passes
- build passes
- migration dry-run succeeds against local or test data
- generated output matches the spec
- feature remains behind an existing flag

Stop gate examples:

- dependency addition changes licence, bundle size, runtime permissions, or supply-chain risk
- database migration could destroy, transform, or backfill production data
- spec allows multiple incompatible product behaviours
- security or authorisation behaviour is ambiguous
- public API shape is not defined and affects external consumers
- required credentials, secrets, or production access are unavailable
- rollout strategy affects live customers and is not specified

## Task Granularity

Tasks should be independently reviewable and commit-sized.

Within each task, use TDD-shaped checkpoints:

1. write the failing test
2. run it to verify it fails for the expected reason
3. implement the minimal change
4. run the focused test to verify it passes
5. refactor if needed
6. run the relevant broader check
7. commit

Prefer two-to-five-minute checkpoints inside each TDD loop. Do not split mechanical setup, imports, or repetitive assertions into artificial micro-steps unless doing so reduces risk.

A task is too large if:

- it changes unrelated behaviours
- it cannot be tested independently
- it creates a commit that is hard to review
- it crosses phase boundaries
- it touches files that should be owned by separate agents
- it combines schema, dependency, and feature behaviour without a gate

A task is too small if:

- it cannot produce a meaningful test or verification result
- it creates noisy commits without reducing risk
- it only rearranges wording or imports unless that is the whole intended change

Use hierarchical task identifiers:

- Task 1.1
- Task 1.2
- Task 2.1

## Task Template

Every task must use this structure:

````markdown
### Task N.M: [Task Name]

**Phase:** Phase N - [Phase Name]

**Purpose:** [What this task makes true.]

**Dependencies:**

- [Task IDs that must complete first, or "None"]

**Parallelisation:** Sequential | Parallel-safe | Parallel-after Task N.M

**Collision Risk:**

- [Files, modules, schemas, fixtures, generated artefacts, or commands that must not be edited or run concurrently]

**Files:**

- Create: `exact/path/to/new_file.ext`
- Modify: `exact/path/to/existing_file.ext`
- Delete: `exact/path/to/old_file.ext`
- Test: `exact/path/to/test_file.ext`

**Commit Scope:**

- Expected files in commit: `path/a`, `path/b`, `path/c`
- Commit message: `type(scope): concise imperative summary`

**Sanity Gates:**

- **Risks:** [Specific ways this task could break behaviour, data, dependencies, schema, security, privacy, or operations.]
- **Missing Evidence:** [Facts not verified before execution. Use "None" only when true.]
- **Edge Cases:** [Concrete cases the executor must handle or test.]
- **Test Strategy:** [Exact test layer, file, and command.]
- **Irreversible Operations:** Yes/No. If yes, list the command, migration, destructive action, required pre-check, and rollback or mitigation.

**Enforcement:**

- [mechanical] [Rule or behaviour.] Enforcer: `exact/test/or/check`.
- [doc] [Rule or decision.] Holder: `spec section`, `AGENTS.md`, `ADR`, or this plan.

#### Steps

- [ ] **Step 1: Write the failing test**

  Add or modify `exact/path/to/test_file.ext`.

  ```language
  [Concrete test code, assertions, fixtures, and expected behaviour.]
  ```

- [ ] **Step 2: Run the focused test and verify it fails for the expected reason**

  Working directory: `[repo root or exact subdirectory]`

  Run:

  ```bash
  [exact command]
  ```

  Expected result:

  ```text
  [Expected failure signal, error name, assertion message, or missing symbol.]
  ```

- [ ] **Step 3: Implement the minimal change**

  Add or modify `exact/path/to/file.ext`.

  ```language
  [Exact code when small and grounded, or a precise patch shape with exact signatures, invariants, and integration points.]
  ```

- [ ] **Step 4: Run the focused test and verify it passes**

  Working directory: `[repo root or exact subdirectory]`

  Run:

  ```bash
  [exact command]
  ```

  Expected result:

  ```text
  [Expected pass signal.]
  ```

- [ ] **Step 5: Refactor only if needed**

  [State the allowed refactor scope. If no refactor is expected, say "No refactor expected."]

- [ ] **Step 6: Run the relevant broader check**

  Working directory: `[repo root or exact subdirectory]`

  Run:

  ```bash
  [exact command]
  ```

  Expected result:

  ```text
  [Expected pass signal.]
  ```

- [ ] **Step 7: Commit**

  Run:

  ```bash
  git add [exact files]
  git commit -m "[exact commit message]"
  ```
````

## Workflow Sanity Gates Per Task

Every task must include the "Sanity Gates" fields from the task template.

Rules:

- do not leave a sanity gate field blank
- use "None" only when it is true
- list concrete risks, not generic risk categories
- list concrete edge cases, not "handle edge cases"
- name exact tests and commands in the test strategy
- any task changing schema, dependencies, authentication, authorisation, payment, fulfilment, customer data, privacy, security, or irreversible infrastructure state must include rollback or mitigation notes
- any irreversible operation must have a pre-check and a rollback, mitigation, or explicit stop gate

## Enforcement Mode Tagging

Every rule, decision, and constraint in the plan must be tagged `[mechanical]` or `[doc]`.

The distinction is deliberate.

`[mechanical]` means enforced by something the executor cannot bypass by explanation alone.

Mechanical enforcers include:

- unit test
- integration test
- end-to-end test
- type-check
- lint rule
- formatter
- build check
- schema validation
- migration dry-run
- pre-commit hook
- generated snapshot check
- CI command

Every mechanical item must name the enforcer.

Example:

```markdown
- [mechanical] All order inputs must reject negative quantities. Enforcer: `tests/orders/order-validation.test.ts`.
```

`[doc]` means enforced only by being written down.

Doc holders include:

- the spec
- this plan
- `AGENTS.md`
- an ADR
- a runbook
- an architecture document

Every doc item must name the holder.

Example:

```markdown
- [doc] The checkout orchestration boundary remains in the existing service layer. Holder: `docs/specs/checkout-refresh.md`.
```

Default to `[mechanical]` when feasible.

Convert docs into tests wherever the rule is precise enough to express as code. Docs are for direction; mechanics are the wall.

Missing tag equals plan failure.

## Code Specificity

Plans must be concrete, but not speculative.

For test steps, include concrete test cases, assertions, fixtures, and expected failure modes.

For implementation steps, include one of:

1. exact code when the change is small and fully grounded in inspected repository context
2. a precise patch shape when the implementation depends on nearby code the executor must inspect
3. exact interface signatures, invariants, and acceptance checks when full code would duplicate too much context

Do not include speculative production code that depends on:

- unverified APIs
- uninspected files
- invented types
- invented helper functions
- invented framework patterns
- guessed generated code
- guessed line numbers

If a step changes code, it must show how:

- exact code, or
- exact signature plus patch shape, or
- exact test-first behavioural contract with integration point

Do not write vague implementation instructions.

## Command Grounding

Every command must be copied from repository evidence or derived from project configuration.

For each command, include:

- working directory
- command
- expected success signal
- expected failure signal for red tests
- required environment variables, using placeholder names only for secrets
- whether the command is focused or broad

Do not invent package scripts.

If the command is unknown:

1. inspect manifests and config
2. use the nearest verified command
3. record remaining uncertainty under "Missing Evidence"
4. stop if command uncertainty makes the plan unsafe

For red tests, expected failure must be specific.

Good:

```text
Expected: FAIL with "Cannot find name 'normaliseBasketLine'"
```

Bad:

```text
Expected: test fails
```

## No Placeholders

These are plan failures. Never write them:

- `TBD`
- `TODO`
- `implement later`
- `fill in details`
- `add appropriate error handling`
- `add validation`
- `handle edge cases`
- `write tests for the above`
- `similar to Task N`
- `etc.`
- `and so on`
- `update as needed`
- `use the usual pattern`
- references to types, functions, files, or methods not defined by repository evidence or earlier tasks
- steps that describe what to do without showing how
- commands without expected results
- tasks without commit scope
- gates without proceed rules
- doc-only constraints that could reasonably be mechanical

If repetition is necessary for task independence, repeat the relevant detail. The executor may be reading tasks out of order.

## Acceptance Criteria

Every plan must include an "Acceptance Criteria" section near the end.

```markdown
## Acceptance Criteria

- [mechanical] [Observable behaviour.] Verified by `exact command or test`.
- [mechanical] [Regression protection.] Verified by `exact command or test`.
- [doc] [Documented operational or architectural decision.] Holder: `exact holder`.
```

Rules:

- acceptance criteria must be observable
- acceptance criteria must map back to requirements
- acceptance criteria must be mechanically verified whenever feasible
- any doc-only acceptance criterion must name the holder and explain why mechanical enforcement is not feasible

## Self-Review

After writing the complete plan, review it against the spec and repository evidence.

This is a checklist you run yourself. Do not dispatch a subagent for this step.

Check:

1. **Spec coverage:** Skim each section and requirement in the spec. Confirm every requirement maps to at least one task and one verification method.
2. **Repository grounding:** Confirm every file path, command, framework assumption, type, and naming convention is supported by repository evidence or listed as an assumption.
3. **Placeholder scan:** Search for forbidden placeholder phrases from the "No Placeholders" section. Fix them.
4. **Type consistency:** Confirm types, method signatures, function names, and property names are consistent across all tasks.
5. **Interface depth:** For each new module, check whether it has meaningful behaviour per call. Remove thin pass-through wrappers unless they protect a real boundary.
6. **Enforcement tags:** Confirm every rule, decision, and constraint carries `[mechanical]` or `[doc]`, and names its enforcer or holder.
7. **Phase gates:** Confirm every phase has a continue gate or stop gate. Continue gates must have exact mechanical checks. Stop gates must name the blocking decision and the minimum question to ask.
8. **One-shot execution:** Confirm the plan can be handed to an executor and completed without returning to the planner. Any required user interaction must be isolated to explicit stop gates.
9. **Parallelisation:** Confirm every task has dependency, parallelisation, collision risk, and commit scope metadata.
10. **Sanity gates:** Confirm every task has risks, missing evidence, edge cases, test strategy, and irreversible operations fields.
11. **Command validity:** Confirm commands are grounded in repository config and include working directory plus expected output.
12. **Acceptance criteria:** Confirm acceptance criteria are observable and mapped to requirements.

If issues are found, fix them inline. No second review is required. Fix and move on.

If a spec requirement has no task, add the task.

For deeper review guidance, optionally consult `references/plan-quality-rubric.md`. The rubric is advisory. The requirements in this `SKILL.md` remain canonical.

## Plan Quality Check

Every plan must end with this section before the execution handoff:

```markdown
## Plan Quality Check

- Spec coverage complete: Yes/No
- Repository evidence attached for paths and commands: Yes/No
- Placeholder scan clean: Yes/No
- Tests defined before implementation: Yes/No
- Enforcement tags complete: Yes/No
- Phase gates defined: Yes/No
- Continue gates are mechanically checkable: Yes/No
- Stop gates name blocking decisions: Yes/No/None
- Parallelisation constraints defined: Yes/No
- Sanity Gates fields complete per task: Yes/No
- Irreversible operations identified: Yes/No/None
- Acceptance criteria mapped to requirements: Yes/No
- Known gaps: [List concrete gaps or "None"]
```

Do not mark "Yes" unless it is true.

If the plan is complex, high-risk, multi-phase, or likely to be executed by multiple downstream agents, optionally score it using `references/plan-quality-rubric.md`.

Do not block plan creation solely because the rubric was not used. Block only when this `SKILL.md` identifies a stop condition, safety issue, missing evidence, or plan failure.

## Execution Handoff

After saving the plan, say exactly:

"Plan complete and saved to `docs/plans/<file>.md`. Optionally invoke `opus-reviewer` on the plan for an independent review (advised, not required), then `/skill:executing-plans docs/plans/<file>.md` to create tasks."

For an independent quality review, optionally invoke `opus-reviewer` with this plan and `references/plan-quality-rubric.md`.

## Off-Ramp

If anything unusual emerged during planning that future agents should know, invoke `opus-learn` before context closes.

Examples:

- recurring repository convention not documented elsewhere
- surprising architecture constraint
- brittle test pattern
- dependency or migration caveat
- hidden coupling discovered during reconnaissance
- repeated source of ambiguity in specs

## Governing Principle

The plan is a complete execution contract. Phases organise work. Gates control risk. User questions are allowed only when the next safe action depends on an answer.
