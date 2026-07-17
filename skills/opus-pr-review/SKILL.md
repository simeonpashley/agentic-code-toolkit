---
name: opus-pr-review
disable-model-invocation: true
description: Reviews pull requests and Git commit ranges for correctness, requirement alignment, code quality, architecture, security, testing, production readiness, and root-cause resolution. Use when reviewing a PR, branch, patch, completed implementation, bug fix, issue fix, or code changes before merge.
compatibility: Requires a Git repository and read-only access to the pull request changes, commit history, tests, and relevant issue or requirement context.
---

# Pull Request Code Reviewer

Perform a rigorous, evidence-based review of a pull request or Git commit range before it is merged or used as the foundation for further work.

The review is read-only. Inspect the implementation, surrounding code, history, tests, requirements, and linked issue where available. Do not modify the repository.

## Objectives

Determine whether the change:

1. Implements the stated requirements.
2. Behaves correctly under expected and adverse conditions.
3. Fits the existing architecture and coding conventions.
4. Introduces security, reliability, compatibility, or performance risks.
5. Has sufficient and meaningful test coverage.
6. Is operationally ready for production.
7. Resolves the root cause of a reported issue rather than only suppressing its visible symptoms.

## Inputs

Use all available review context:

- Pull request title and description.
- Linked issue, incident, bug report, or support case.
- Acceptance criteria or implementation plan.
- Base and head revisions.
- Changed files and complete diff.
- Relevant unchanged surrounding code.
- Existing tests and new or modified tests.
- Commit history and blame history where useful.
- CI results, static analysis results, and test output when available.

When required context is unavailable, state what is missing and explain how it limits the review. Do not invent requirements or issue details.

## Review Boundaries

### Read-only operation

Do not mutate:

- The working tree.
- The Git index.
- `HEAD`.
- The current branch.
- Repository configuration.
- Generated files.
- Dependencies.
- Databases or external systems.

Use read-only commands such as:

```bash
git status --short
git diff --stat <base>..<head>
git diff --find-renames <base>..<head>
git log --oneline --decorate <base>..<head>
git show <revision>
git blame <file>
git grep <pattern>
```

Commands that execute tests or static analysis may be used only when they do not modify tracked files, persistent state, or external systems.

Never use `git checkout`, `git switch`, `git reset`, `git clean`, `git commit`, `git rebase`, or commands that alter branch or index state in the review checkout.

When another revision must be materialised, use a separate temporary worktree:

```bash
git worktree add --detach /tmp/pr-review-<revision> <revision>
```

Remove temporary review resources after use where permitted.

## Review Procedure

Follow the sequence below. Do not produce a verdict from the diff alone unless the repository context is genuinely sufficient.

### 1. Establish the review contract

Extract and restate:

- What the change claims to implement or fix.
- The relevant requirements and acceptance criteria.
- The expected behaviour before and after the change.
- Explicit non-goals.
- Compatibility, migration, performance, or security constraints.
- The linked issue's reported symptoms, reproduction steps, and expected outcome.

Identify ambiguity or contradictions in the requirements separately from implementation defects.

### 2. Inspect the change surface

Review:

```bash
git diff --stat <base>..<head>
git diff --name-status <base>..<head>
git diff --find-renames <base>..<head>
git log --oneline <base>..<head>
git diff <base>..<head>
```

Determine:

- Which components and behavioural paths changed.
- Which public interfaces, schemas, configurations, or data formats changed.
- Whether generated, vendored, migration, lock, or documentation files are involved.
- Whether the apparent scope matches the stated purpose.
- Whether unrelated changes increase risk or obscure reviewability.

### 3. Read surrounding code

For every materially changed path:

- Read the complete changed function, class, module, or configuration section.
- Inspect callers and downstream consumers.
- Inspect types, schemas, validation rules, and error contracts.
- Inspect comparable implementations elsewhere in the repository.
- Inspect existing tests for the affected behaviour.
- Check whether the change violates assumptions outside the diff.

Do not report findings about code that has not been inspected.

### 4. Validate requirement alignment

Check whether:

- Every acceptance criterion is implemented.
- The implementation's externally observable behaviour matches the requirements.
- Error behaviour matches the expected contract.
- Any deviation is intentional, documented, and technically justified.
- The implementation contains unnecessary scope not supported by the requirements.
- Required documentation, configuration, telemetry, or migration work is present.

Flag defects in the plan or requirements separately from defects in the implementation.

### 5. Validate root-cause resolution

Apply this section whenever the pull request claims to fix a bug, incident, regression, support issue, vulnerability, test failure, or operational problem.

#### 5.1 Reconstruct the failure chain

Identify, from evidence:

1. The user-visible or system-visible symptom.
2. The immediate failure mechanism.
3. The invalid state, incorrect assumption, missing invariant, race, data condition, or design flaw that allowed the mechanism.
4. The earliest controllable point where the failure should have been prevented.
5. Other entry points that can produce the same invalid state or trigger the same mechanism.

Represent the chain explicitly:

```text
Trigger or input
  -> invalid state or violated invariant
  -> failure mechanism
  -> observed symptom
```

#### 5.2 Classify the fix location

Classify the implementation as one of:

- **Root-cause fix**: prevents or correctly handles the invalid state at the appropriate ownership boundary.
- **Contributing-cause fix**: removes one necessary factor but leaves another plausible path to the same failure.
- **Defensive containment**: safely limits impact but does not remove the underlying defect.
- **Symptom suppression**: hides, retries, filters, catches, or special-cases the observed failure without restoring the violated invariant.
- **Unrelated or unproven**: does not have a demonstrable causal relationship to the reported issue.

Containment may be appropriate for operational safety, but it must not be described as a complete root-cause fix unless the causal chain supports that conclusion.

#### 5.3 Root-cause evidence requirements

A bug-fix PR should normally provide evidence that:

- A test or reliable reproduction fails before the change.
- The same test or reproduction passes after the change.
- The test exercises the causal mechanism, not only the final output.
- The implementation repairs the violated invariant or incorrect ownership boundary.
- Equivalent inputs or alternate entry points are handled.
- The fix does not merely ignore an exception, hide an error, increase a timeout, add an arbitrary retry, clamp a value, or special-case one known input without justification.
- The fix does not move the symptom to another component.
- The issue cannot recur through an adjacent path left unchanged.
- New failure modes introduced by the fix are tested.

When a before-and-after test cannot reasonably be supplied, require equivalent causal evidence such as a deterministic trace, state transition proof, incident telemetry, or a narrowly reasoned invariant analysis.

#### 5.4 Common symptom-fix indicators

Investigate carefully when the PR:

- Adds a null check only at the crash site while the invalid null originates elsewhere.
- Catches and discards an exception without correcting the invalid operation.
- Adds retries without addressing deterministically invalid requests or state.
- Increases a timeout without analysing why work exceeds the prior limit.
- Filters malformed records only at presentation time.
- Adds one literal value, identifier, route, or customer-specific exception.
- Resets state after corruption rather than preventing corruption.
- Disables validation, tests, warnings, or safeguards.
- Changes a test to accept the faulty behaviour.
- Adds a guard in one caller while other callers remain exposed.
- Treats a concurrency problem by adding delay or ordering assumptions.
- Fixes persisted data on read while continuing to write invalid data.
- Suppresses duplicate operations in the UI while the backend remains non-idempotent.
- Handles the reported example but not the equivalence class that caused it.

These patterns are review signals, not automatic defects. Evaluate them against the actual ownership model and requirements.

#### 5.5 Root-cause review questions

Answer the following where applicable:

- What invariant was violated?
- Which component owns that invariant?
- Does the change enforce it at that ownership boundary?
- Why was the invalid state possible before this change?
- Can another caller, input, code path, or concurrent operation still create it?
- Does the fix address existing corrupted or legacy state?
- Is containment also needed while historical bad state remains?
- Could the change hide future occurrences from monitoring?
- Does telemetry still expose unexpected states?
- Does the regression test fail for the correct reason before the fix?
- Would the test still pass if the implementation only masked the symptom?
- Is the claimed root cause demonstrated or merely asserted?

If the causal chain cannot be established, report that the root-cause claim is unverified.

### 6. Review correctness and code quality

Check:

- Correct control flow and data flow.
- Explicit handling of failure states.
- Boundary and input validation.
- Type safety and nullability.
- Resource acquisition and release.
- Transactional consistency.
- Idempotency where operations can be retried.
- Concurrency, race conditions, locking, and ordering.
- Time-zone, locale, clock, and date boundary behaviour.
- Numeric precision, overflow, rounding, and unit consistency.
- Determinism where required.
- Separation of concerns.
- Duplication versus justified abstraction.
- Dead code and unreachable branches.
- Consistency with repository conventions.
- Clear naming and maintainable structure.

Distinguish correctness defects from stylistic preferences.

### 7. Review architecture and integration

Check:

- Ownership of business rules and invariants.
- Direction of dependencies.
- Module and service boundaries.
- API contracts and versioning.
- Persistence and schema changes.
- Event, queue, cache, and asynchronous semantics.
- Backward and forward compatibility.
- Failure isolation and recovery.
- Scalability and algorithmic complexity.
- Memory, network, storage, and database costs.
- Observability and diagnosability.
- Integration with existing components and deployment topology.

Flag architecture issues only when they create a concrete maintenance, correctness, security, performance, or operability risk.

### 8. Review security and privacy

Where relevant, check:

- Authentication and authorisation.
- Tenant and account isolation.
- Input validation and output encoding.
- Injection risks.
- Path traversal and unsafe file access.
- Secret and credential handling.
- Sensitive data exposure.
- Logging of personal or confidential data.
- Cryptographic usage.
- Request forgery and unsafe redirects.
- Deserialisation and parser risks.
- Dependency or supply-chain implications.
- Rate limiting and abuse controls.
- Permission expansion.
- Fail-open behaviour.

Describe the exploit or failure path rather than labelling code generically as insecure.

### 9. Review tests

Assess whether tests:

- Exercise externally meaningful behaviour.
- Fail against the base revision for the reported defect.
- Pass against the head revision.
- Cover the root-cause mechanism.
- Cover the complete equivalence class, not only one example.
- Include relevant boundary, failure, and concurrency cases.
- Avoid excessive mocking of the behaviour under test.
- Assert outcomes rather than implementation trivia.
- Remain deterministic and isolated.
- Cover integration boundaries where unit tests are insufficient.
- Protect against plausible regressions introduced by the fix.
- Preserve existing behaviour not intended to change.

Do not equate line coverage with behavioural coverage.

When tests cannot be run, state that explicitly and distinguish code-inspection findings from executed evidence.

### 10. Review production readiness

Check:

- Database and schema migration safety.
- Roll-forward and rollback behaviour.
- Compatibility during mixed-version deployment.
- Data backfill or repair requirements.
- Configuration defaults and validation.
- Feature flag lifecycle.
- Operational limits and capacity.
- Monitoring, metrics, logs, and alerts.
- Failure recovery and support diagnostics.
- Documentation and runbooks.
- Dependency and lockfile consistency.
- Removal of debugging code, temporary bypasses, and unsafe defaults.

### 11. Calibrate findings

Only report an issue when all of the following can be stated:

1. The specific code or omission involved.
2. The conditions that trigger the problem.
3. The resulting impact.
4. Why the current implementation is incorrect or materially risky.
5. A practical remediation direction.

Do not report speculative concerns without a plausible triggering path.

Use these severities:

#### Critical - Must fix before merge

Use for defects likely to cause one or more of:

- Security compromise.
- Data loss or unrecoverable corruption.
- Material privacy breach.
- Broad production outage.
- Fundamentally broken primary functionality.
- Unsafe migration or deployment with severe impact.

#### Important - Should fix before merge

Use for:

- Incorrect behaviour in realistic conditions.
- Incomplete requirement implementation.
- Unresolved or unverified root cause.
- A symptom-only fix where recurrence remains plausible.
- Missing handling for significant edge cases.
- Material architecture or integration defects.
- Meaningful security, reliability, performance, or compatibility risks.
- Test gaps that leave the claimed behaviour unproven.

#### Minor - Non-blocking improvement

Use for:

- Localised maintainability problems.
- Low-impact edge cases.
- Documentation gaps that do not impair safe operation.
- Small consistency or clarity improvements.
- Measurable but non-material optimisation opportunities.

Do not escalate style preferences or hypothetical risks.

## Output Format

Return the review in the following structure.

### Review Scope

- **Change reviewed:** Brief description.
- **Base:** `<base revision>`
- **Head:** `<head revision>`
- **Requirements reviewed:** List or state that none were supplied.
- **Issue context reviewed:** Linked issue or state that none was supplied.
- **Validation performed:** Diff inspection, source inspection, tests run, static analysis, or other evidence.
- **Validation not performed:** Anything material that could not be checked.

### Behavioural and Root-Cause Analysis

Include this section for issue-fixing PRs.

- **Reported symptom:** What was observed.
- **Failure mechanism:** How the symptom occurs.
- **Underlying cause:** The violated invariant, invalid state, incorrect assumption, or design defect.
- **Fix location:** Where the PR intervenes in the failure chain.
- **Classification:** Root-cause fix, contributing-cause fix, defensive containment, symptom suppression, or unproven.
- **Evidence:** Tests, reproduction, code paths, history, telemetry, or reasoning supporting the classification.
- **Residual paths:** Other ways the problem could still occur.
- **Conclusion:** Whether the PR demonstrably resolves the issue's root cause.

Omit this section only when the change does not claim to fix an issue.

### Strengths

List specific strengths supported by inspected code or executed evidence.

Examples:

- Correctly enforces the domain invariant at the write boundary.
- Regression test fails on the base revision and passes on the head revision.
- Migration supports mixed-version deployment.
- Error handling preserves actionable diagnostic context.

Do not include generic praise.

### Issues

#### Critical - Must Fix

For each issue use:

1. **Concise issue title**

   - **Location:** `path/to/file.ext:line-line`
   - **Evidence:** The relevant behaviour or code path.
   - **Trigger:** Conditions required to reproduce the issue.
   - **Impact:** Concrete consequence.
   - **Why it matters:** Technical explanation.
   - **Recommended change:** Specific remediation direction.
   - **Confidence:** High, medium, or low.

Write `None identified` when there are no critical findings.

#### Important - Should Fix

Use the same structure.

Write `None identified` when there are no important findings.

#### Minor - Nice to Have

Use the same structure, omitting fields that are not useful for a genuinely minor finding.

Write `None identified` when there are no minor findings.

### Requirement Coverage

Provide a compact mapping:

| Requirement                         | Status                                     | Evidence                            |
| ----------------------------------- | ------------------------------------------ | ----------------------------------- |
| Requirement or acceptance criterion | Met, Partially met, Not met, or Unverified | Files, tests, or observed behaviour |

Do not claim that a requirement is met without evidence.

### Test Assessment

- **Tests executed:** Commands and outcomes.
- **Regression evidence:** Whether the relevant test fails before and passes after the change.
- **Coverage quality:** Behavioural paths and edge cases covered.
- **Gaps:** Missing tests or unverified behaviour.
- **Test reliability:** Determinism, isolation, and mock fidelity.

### Recommendations

Include non-finding improvements that would materially improve design, maintainability, testing, operability, or review process.

Do not repeat issues already listed.

### Assessment

- **Ready to merge:** Yes, No, or With fixes.
- **Root cause resolved:** Yes, No, Unproven, or Not applicable.
- **Reasoning:** A concise technical assessment based on the highest-severity findings and available evidence.
- **Required before merge:** List blocking actions, or `None`.

## Verdict Rules

Use `Yes` only when:

- No Critical or Important findings remain.
- Requirements are met or intentionally revised.
- The change is adequately tested.
- Production risks are controlled.
- For an issue-fixing PR, root-cause resolution is demonstrated or the PR is explicitly and appropriately scoped as containment.

Use `With fixes` when:

- The design is generally sound.
- One or more bounded Important findings should be corrected before merge.
- The required remediation does not require substantial redesign.

Use `No` when:

- A Critical defect exists.
- The primary requirements are not implemented.
- The claimed issue fix does not address the demonstrated cause and substantial redesign is required.
- The change cannot be safely deployed.
- Review evidence shows the implementation is fundamentally unsound.

A PR that only suppresses symptoms must not receive `Root cause resolved: Yes`.

## Critical Review Rules

### Do

- Review the actual diff and relevant surrounding code.
- Trace changed behaviour through callers and dependencies.
- Use file and line references.
- Explain the triggering conditions and impact.
- Separate requirement defects from implementation defects.
- Distinguish root-cause correction from containment.
- Verify regression tests against the causal mechanism.
- Calibrate severity according to realistic impact.
- State what could not be validated.
- Give a clear merge verdict.

### Do not

- Approve based only on the PR description.
- Assume the linked issue's proposed solution is the actual root cause.
- Treat a passing test suite as proof of correctness.
- Treat added tests as valid without checking what they assert.
- Call a guard, retry, timeout increase, exception catch, or special case a root-cause fix without tracing the failure chain.
- Report findings about code that was not inspected.
- Use vague feedback such as "improve error handling".
- Mark stylistic preferences as blocking.
- invent file paths, line references, requirements, execution results, or issue context.
- Modify the repository during review.
- Avoid a clear verdict.

## Example Root-Cause Analysis

```text
Reported symptom:
Checkout requests intermittently create duplicate orders after a client timeout.

Failure chain:
Client request succeeds
  -> response is lost or exceeds the client timeout
  -> client retries the same logical operation
  -> API creates a second order because the operation is not idempotent
  -> customer sees duplicate orders

PR change:
The UI disables the submit button after the first click.

Classification:
Symptom suppression.

Reasoning:
The UI change reduces duplicate clicks in one client, but it does not address
network retries, multiple browser sessions, direct API clients, or queue
redelivery. The backend still permits the same logical operation to create
multiple orders.

Root-cause remediation:
Introduce an idempotency key or equivalent domain-level uniqueness constraint
at the order creation boundary. Add a regression test showing that repeated
requests with the same operation identity return the original order rather
than creating another.
```

## Example Review Finding

```text
1. Duplicate creation remains possible through API retries
   - Location: services/orders/create-order.ts:42-76
   - Evidence: The handler inserts a new order for every request and does not
     persist or validate an operation identity. The PR only disables the web
     submit button.
   - Trigger: A successful request is retried after the response is lost.
   - Impact: Customers can be charged or fulfilled more than once.
   - Why it matters: The change acts after one UI trigger but leaves the
     backend invariant unenforced across other callers and retry paths.
   - Recommended change: Enforce idempotency at the order creation boundary
     and add a base-failing, head-passing integration test for repeated
     requests.
   - Confidence: High.
```
