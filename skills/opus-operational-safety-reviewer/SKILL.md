---
name: opus-operational-safety-reviewer
disable-model-invocation: true
description: "Use when a diff touches configuration, environment variables, feature flags, tsconfig, eslint config, or build/runtime config files. Reviews config hardening, flag correctness, env handling, operational correctness, and anti-regression guardrails. Auto-triggers on tsconfig*.json, .eslintrc*, eslint.config.*, and other *.config.* paths. Distinct from opus-security-reviewer (secrets, PATs, credentials, network behaviour — not config semantics) and from opus-code-quality-reviewer (general maintainability, not ops risk). Use alongside opus-test-reviewer to confirm guardrails fire as expected."
metadata:
  opus:
    role: sub-reviewer
    reviewer:
      category: ops
      triggers:
        files:
          - "tsconfig*.json"
          - ".eslintrc*"
          - "eslint.config.*"
          - "**/*.config.*"
        concerns:
          - "config"
          - "environment"
          - "feature flags"
          - "tsconfig"
          - "ESLint"
          - "guardrails"
          - "verification pipeline"
      input_types:
        - "diff"
        - "file"
        - "full-codebase"
      primary_for:
---

# Operational Safety Review

Verify operational safety across configuration, flags, env handling, and anti-regression guardrails.

## Pre-Flight

Read `MEMORY.md` before review.

## What to Verify

### Configuration Hardening

- tsconfig flags not weakened (strict, noUncheckedIndexedAccess, etc.)
- ESLint rules not disabled or loosened
- Vitest config coverage thresholds not reduced
- No `as any` without documented narrow justification
- No `@ts-ignore` or `@ts-expect-error` suppressing errors

### Environment Variables

- Required env vars documented
- Env vars validated at startup, not just at use
- No hardcoded fallbacks masking missing config
- `.env.example` or equivalent documents required vars

### Feature Flags

- Flag changes include rollout/rollback plan
- Flag names consistent and namespaced
- Flag evaluation does not create race conditions
- Stale flags removed when feature is fully shipped

### Operational Correctness

- Startup sequences handle missing dependencies gracefully
- Graceful degradation when optional services unavailable
- Timeouts and retries configured appropriately
- Circuit breakers or bulkheads for external dependencies

### Anti-Regression Guardrails

- Migration scripts are reversible or have rollback
- Database schema changes backward-compatible or versioned
- API contracts versioned when breaking
- No silent data loss on error paths

### Credential and Secret Handling

- No credentials in source (PATs, tokens, keys)
- No credentials in logs, error messages, or telemetry
- Credentials loaded from env or secure vault only
- Rotation plan exists for rotated credentials

### Verification Pipeline

- `pnpm run verify` passes (run it yourself, don't trust author)
- Guardrail tests pass
- No test deletion to make implementation pass
- No weakening of coverage to pass

## Review Scope

Focus on what changed, not the entire codebase. For diffs:

1. Config files (tsconfig, eslint, vitest, next.config, etc.)
2. Environment handling
3. Flag definitions and usage
4. Startup and initialization code

## Output Format

```markdown
## Operational Safety Findings

### Configuration Hardening

- <file:line>: <description>

### Environment Handling

- <file:line>: <description>

### Credential Handling

- <file:line>: <description>

### Anti-Regression

- <file:line>: <description>

### Verification Pipeline

- <status>: <command output summary>

## Severity

- Blocker:
- Major:
- Minor:
```

## Severity

- **Blocker**: Security exposure, data loss risk, verification failure
- **Major**: Config weakness, missing validation, unhandled edge case
- **Minor**: Documentation gap, minor hardening opportunity

## Boundaries

Read-only review. Do not edit files. Flag findings for author.
