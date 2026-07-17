# Plan Quality Rubric

Use this rubric to review implementation plans created by the `writing-plans` skill.

This rubric is optional guidance. The canonical requirements remain in `SKILL.md`.

A plan is acceptable only if it can be handed to an executor with no prior repository context and implemented safely, task by task, without returning to the original planner except at explicit stop gates.

## Scoring

Score each category from 0 to 3.

- **0 - Fails:** Missing, unsafe, speculative, or unusable.
- **1 - Weak:** Present but incomplete, vague, or inconsistently applied.
- **2 - Acceptable:** Complete enough for execution, with minor gaps that do not materially affect safety or correctness.
- **3 - Strong:** Precise, repository-grounded, mechanically verifiable, and resilient to agent misuse.

## Pass Threshold

A plan passes review only when:

- no category scores 0
- no safety-critical category scores below 2
- total score is at least 24 out of 30
- all stop gates, if any, name the exact blocking decision
- all irreversible operations have a pre-check and rollback or mitigation

Safety-critical categories are:

- Repository Grounding
- Workflow Sanity Gates
- Enforcement and Verification
- Phase Gates
- Command Grounding

## 1. Spec Coverage

**Question:** Does the plan implement the approved spec completely and only the approved spec?

### 0 - Fails

- Requirements are missing.
- Tasks implement behaviour not present in the spec.
- Acceptance criteria are absent.
- Non-goals are ignored.

### 1 - Weak

- Most major requirements are covered, but some edge cases or acceptance criteria are missing.
- Requirements are described narratively but not mapped to tasks.
- Non-goals are mentioned but not operationalised.

### 2 - Acceptable

- Every requirement maps to at least one task.
- Every acceptance criterion maps to a verification method.
- Non-goals are respected.
- Any intentional exclusions are stated.

### 3 - Strong

- Requirements traceability is complete and easy to audit.
- Each requirement has a mechanical verification path where feasible.
- The plan avoids scope creep and preserves the spec's boundaries.
- Ambiguities are isolated as assumptions or stop gates.

## 2. Repository Grounding

**Question:** Are file paths, commands, patterns, interfaces, and conventions grounded in repository evidence?

### 0 - Fails

- Invented file paths, commands, APIs, or framework patterns.
- No evidence of repository reconnaissance.
- Plan assumes architecture that conflicts with the codebase.

### 1 - Weak

- Some paths and commands are grounded, but others appear guessed.
- Comparable implementations are not referenced.
- Repository conventions are inconsistently followed.

### 2 - Acceptable

- File paths and commands are grounded in repository evidence.
- Existing architecture and test patterns are followed.
- Unverified facts are recorded as missing evidence or assumptions.

### 3 - Strong

- Reconnaissance clearly identifies relevant modules, tests, config, and conventions.
- New boundaries fit existing architecture.
- The executor has enough repository context to avoid wrong turns.
- Assumptions are high-confidence or isolated.

## 3. Task Decomposition

**Question:** Are tasks small, reviewable, testable, and sequenced correctly?

### 0 - Fails

- Tasks are too broad to implement safely.
- Tasks mix unrelated changes.
- Dependencies are unclear.
- Commits are not defined.

### 1 - Weak

- Tasks are mostly sequential but uneven in size.
- Some tasks lack clear purpose or commit scope.
- Some dependencies are implicit.

### 2 - Acceptable

- Tasks are independently reviewable and commit-sized.
- Dependencies are explicit.
- Each task has files, purpose, test strategy, and commit scope.
- TDD checkpoints are present.

### 3 - Strong

- Tasks form a clean red-green-refactor sequence.
- Each task produces a meaningful, testable increment.
- Parallel-safe work is clearly separated.
- Collision risks are explicit and practical.

## 4. TDD and Test Design

**Question:** Does the plan define tests before implementation with concrete expected behaviours?

### 0 - Fails

- Tests are absent or deferred.
- Test steps say only "write tests".
- Expected failures are vague.
- Behaviour is not observable.

### 1 - Weak

- Tests are named but not concrete.
- Assertions are incomplete.
- Edge cases are under-specified.
- Red test failure modes are generic.

### 2 - Acceptable

- Each implementation task starts with a concrete failing test where feasible.
- Assertions and fixtures are specified.
- Expected red and green outcomes are stated.
- Focused and broader test commands are included.

### 3 - Strong

- Tests encode the core contract and edge cases.
- Failure modes are specific enough to catch wrong implementations.
- Test layers are appropriate to the risk.
- Regression coverage is explicit and minimal.

## 5. Enforcement and Verification

**Question:** Are rules, decisions, and constraints tagged and enforced correctly?

### 0 - Fails

- Enforcement tags are missing.
- Mechanical claims do not name enforcers.
- Doc-only constraints are used where tests are feasible.

### 1 - Weak

- Tags exist but are inconsistently applied.
- Some enforcers are vague.
- Verification commands are incomplete.

### 2 - Acceptable

- Every rule, decision, and constraint has `[mechanical]` or `[doc]`.
- Mechanical items name exact enforcers.
- Doc items name exact holders.
- Acceptance criteria are verifiable.

### 3 - Strong

- Most precise rules are mechanically enforced.
- Doc-only items are justified by nature of the decision.
- Verification is layered: focused tests, type-check, lint, build, integration where relevant.
- The executor cannot reasonably bypass core constraints.

## 6. Workflow Sanity Gates

**Question:** Are risks, missing evidence, edge cases, test strategy, and irreversible operations captured per task?

### 0 - Fails

- Sanity gate fields are missing.
- Risk-sensitive work is not identified.
- Irreversible operations lack pre-checks.

### 1 - Weak

- Fields exist but contain generic statements.
- Edge cases are vague.
- Missing evidence is hidden inside task prose.

### 2 - Acceptable

- Every task has complete sanity gate fields.
- Risks are concrete.
- Edge cases are actionable.
- Irreversible operations are identified with pre-checks and mitigations.

### 3 - Strong

- Sanity gates materially improve execution safety.
- High-risk surfaces have rollback or mitigation.
- Missing evidence is isolated and does not undermine safe execution.
- Stop gates are used only when necessary.

## 7. Phase Gates

**Question:** Do phases control execution risk without requiring unnecessary user interaction?

### 0 - Fails

- Phases have no gates.
- Gates are vague review points.
- Execution requires unstated user approval.

### 1 - Weak

- Gates exist but lack exact checks.
- Continue and stop gates are not clearly distinguished.
- Some phase transitions are ambiguous.

### 2 - Acceptable

- Every phase has a continue gate or stop gate.
- Continue gates have exact mechanical checks.
- Stop gates name the blocking decision.
- Proceed rules are explicit.

### 3 - Strong

- Phases provide clear execution control.
- Most gates are continue gates.
- Stop gates are rare and justified.
- The full plan remains one-shot executable unless a named blocking decision is reached.

## 8. Command Grounding

**Question:** Are commands executable, specific, and supported by repository configuration?

### 0 - Fails

- Commands are invented or missing.
- Working directory is unclear.
- Expected output is absent.

### 1 - Weak

- Commands are plausible but not fully grounded.
- Some expected outputs are vague.
- Red test failure signals are generic.

### 2 - Acceptable

- Commands are derived from repository config.
- Working directory is specified.
- Expected pass and fail signals are included.
- Required environment variables are listed safely.

### 3 - Strong

- Commands are minimal for focused checks and sufficient for broad gates.
- Failure conditions are diagnostic.
- Commands avoid destructive behaviour unless explicitly gated.
- The executor can run the plan without guessing.

## 9. Code Specificity

**Question:** Is the plan concrete without inventing speculative implementation code?

### 0 - Fails

- Code is vague where precision is required.
- Plan includes invented APIs or types.
- Steps rely on placeholders.

### 1 - Weak

- Some code and signatures are concrete, but key integration points are unclear.
- Implementation steps describe intent more than method.
- Production code appears over-specified without evidence.

### 2 - Acceptable

- Tests are concrete.
- Implementation steps provide exact code when grounded.
- Larger changes provide exact signatures, patch shape, invariants, and integration points.
- No placeholders remain.

### 3 - Strong

- The plan constrains implementation while still requiring the executor to work against the live repository.
- Interfaces are consistent across tasks.
- Patch shapes are precise enough for independent agents to converge.
- No speculative code is presented as fact.

## 10. Handoff Readiness

**Question:** Can a downstream executor implement the plan without returning to the planner?

### 0 - Fails

- The plan depends on hidden context.
- Later tasks require unresolved decisions.
- Handoff command or saved path is missing.

### 1 - Weak

- Most context is present, but some decisions are implicit.
- Parallelisation or collision guidance is incomplete.
- Known gaps are not clearly separated.

### 2 - Acceptable

- The plan is self-contained.
- Required user interaction appears only in explicit stop gates.
- Parallelisation, collision risk, and commit boundaries are defined.
- Final handoff instructions are present.

### 3 - Strong

- The plan is robust to task-by-task execution by different agents.
- Each task carries enough local context to be executed independently.
- Phase gates and quality checks create clear control flow.
- Known gaps are explicit and non-blocking, or isolated behind stop gates.

## Review Output Format

Use this format when reporting rubric results:

```markdown
# Plan Quality Review

| Category                     | Score | Finding |
| ---------------------------- | ----: | ------- |
| Spec Coverage                |   0-3 | ...     |
| Repository Grounding         |   0-3 | ...     |
| Task Decomposition           |   0-3 | ...     |
| TDD and Test Design          |   0-3 | ...     |
| Enforcement and Verification |   0-3 | ...     |
| Workflow Sanity Gates        |   0-3 | ...     |
| Phase Gates                  |   0-3 | ...     |
| Command Grounding            |   0-3 | ...     |
| Code Specificity             |   0-3 | ...     |
| Handoff Readiness            |   0-3 | ...     |

**Total:** X / 30
**Result:** Pass | Fail

## Blocking Issues

- ...

## Recommended Fixes

1. ...
2. ...
3. ...
```

## Automatic Fail Conditions

A plan fails regardless of numeric score if any of these are true:

- It contains placeholders such as `TBD`, `TODO`, `implement later`, or `handle edge cases`.
- It invents repository paths or commands.
- It has no tests for implemented behaviour where tests are feasible.
- It includes destructive or irreversible operations without a pre-check and rollback or mitigation.
- It changes security, privacy, payment, fulfilment, customer data, or authorisation behaviour without explicit risk handling.
- It cannot be executed without unstated user decisions.
- It has stop gates that do not name the exact blocking decision.
- It lacks an execution handoff.
