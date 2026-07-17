---
name: opus-test-reviewer
disable-model-invocation: true
description: "Use when a diff changes behaviour but the test change is missing, weak, or untested — review-only pass over coverage, test quality, and TDD-strategy compliance against the project's testing-requirements and testing-strategy docs. Auto-triggers on *.test.*, *.spec.*, and __tests__/ paths, and as a sub-reviewer under opus-reviewer. Distinct from opus-test-writer (produces failing tests with TDD discipline, before implementation) and from test-driven-development (the universal discipline, not the reviewer). Pair with requesting-code-review when human review is also wanted."
metadata:
  opus:
    role: sub-reviewer
    reviewer:
      category: code
      triggers:
        files:
          - "**/*.test.*"
          - "**/*.spec.*"
          - "**/__tests__/**"
        concerns:
          - "tests"
          - "coverage"
          - "TDD"
          - "test quality"
          - "regression"
          - "edge cases"
      input_types:
        - "diff"
        - "file"
        - "full-codebase"
      primary_for:
        - "tests"
        - "coverage"
        - "regression"
---

# Test Review

Verify test coverage, quality, and strategy alignment.

## Adjacent Agent Delegation

When triggered, also invoke:

- `opus-code-quality-reviewer` — for code-quality context on the files under review.

## Pre-Flight

Read `MEMORY.md`, `docs/testing-requirements.md`, and `docs/testing-strategy.md` before review.

## What to Verify

### Test Presence

- Every meaningful behavior change has a test
- New modules have corresponding test files
- Edge cases and error paths are covered
- No test deletion to make implementation pass (Blocker)

### Test Quality

- One scenario per test (no bundled assertions)
- Deterministic assertions (no time-based flakiness)
- Real dependencies preferred over mocks where possible
- Error paths covered (not only happy path)
- No snapshot-only tests without readable structure

### Test Strategy Alignment

- Correct layer chosen (unit, component, integration, browser):
  - **Unit**: pure functions, domain transforms, formatters
  - **Component**: React components with RTL
  - **Integration**: page components, route handlers, repository flows
  - **Browser**: routing, auth redirects, storage, real browser APIs
- DOM tests use semantic queries (`getByRole` > `getByLabelText` > `getByText` > `getByTestId`)
- User interactions use `userEvent` over `fireEvent` when fidelity matters
- Network-dependent tests mock at boundary or use MSW

### Test Conventions

- Test file lives next to impl: `foo.ts` → `foo.test.ts`
- Domain tests in `src/domain/*/*.test.ts`
- App tests with mocked ports in `src/application/*/*.test.ts`
- Repo tests use real SQLite with `beforeEach` isolation
- ADO fixture tests load from `test/fixtures/`

### Anti-Pattern Rejection

Reject tests that:

- Assert on implementation details instead of visible behavior
- Use `getByTestId` when semantic query exists
- Use `fireEvent` for flows needing `userEvent`
- Duplicate RTL coverage in Playwright without browser-specific value
- Take large snapshots of whole pages/trees
- Assert on private component state or hook internals
- Use brittle CSS selectors for user-visible behavior
- Depend on real network calls in CI
- Skip loading, empty, or error states for API-bound UI

### Coverage Thresholds

- All new domain code requires tests
- All new repositories require integration tests
- All migrations require tests
- No coverage weakening to pass

### Determinism

Tests must be deterministic across:

- Time (freeze with `vi.useFakeTimers` if needed)
- Locale (set explicitly)
- Timezone (pin if relevant)
- Network (mock boundary)
- Feature flags (control state)
- Random values (seed or stub)

## Review Scope

Focus on what changed. For diffs:

1. New or modified implementation files
2. Corresponding test files (must exist)
3. Test coverage of changed behavior

## Output Format

```markdown
## Test Review Findings

### Missing Tests

- <file>: <reason>

### Coverage Gaps

- <file:line>: <missing scenario>

### Quality Issues

- <file:line>: <issue>

### Strategy Violations

- <file:line>: <violation>

### Anti-Patterns

- <file:line>: <pattern>

### Determinism Issues

- <file:line>: <issue>

## Severity

- Blocker: <test deletion, missing coverage for non-trivial change>
- Major: <quality issues, strategy violations>
- Minor: <minor improvements>

## Coverage

- <module>: <adequate/inadequate>
```

## Severity

- **Blocker**: Test deletion, missing test for non-trivial change, anti-pattern causing CI failures
- **Major**: Coverage gap, quality issue, strategy violation
- **Minor**: Minor improvement suggestion

## Boundaries

Read-only review. Do not edit files. Flag findings for author.
