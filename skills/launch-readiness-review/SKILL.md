---
name: launch-readiness-review
disable-model-invocation: true
description: "Use when a waitlist, private alpha, beta, public launch, app release, product announcement, Product Hunt launch, marketing page, or major feature release needs an explicit go/no-go review. Orchestrates readiness across product, copy, domain/DNS, analytics, privacy, compliance, support, billing, rollback, monitoring, incident response, accessibility, and communication. Project-agnostic release-gate lens. Distinct from founder-operator-review (steady-state operating load, not launch-day gates) and from finishing-a-development-branch (integrates already-shipped code, not the launch itself). Do not use as a substitute for verification-before-completion on individual changes."
license: Proprietary
compatibility: Project-agnostic; suitable for doc-reviewer and release-gate orchestration.
metadata:
  version: "1.0"
  role: release-gate
  opus:
    role: sub-reviewer
    reviewer:
      category: docs
      triggers:
        files:
          - "**/*.md"
          - "**/docs/**"
        concerns:
          - "launch"
          - "go/no-go"
          - "beta"
          - "release"
          - "rollback"
          - "monitoring"
          - "incident"
          - "Product Hunt"
      input_types:
        - "document"
        - "plan"
      primary_for:
---

# Launch Readiness Review Skill

## Adjacent Agent Delegation

When triggered, also invoke:

- `opus-doc-reviewer` — the primary doc/component reviewer — orchestrates the doc-tier specialists.
- `neurodivergent-ux-review` — cognitive load, sensory, time, executive function, predictability, attention, working memory, reading, motor, anxiety, routine.

## Purpose

Use this skill as a go/no-go review before releasing anything public or user-impacting.

It consolidates product, operational, trust, compliance, support, and technical readiness into a structured launch gate.

## Launch Types

Use for:

- domain/holding page launch
- waitlist launch
- private alpha
- invite-only beta
- public beta
- paid launch
- app-store release
- Product Hunt launch
- major feature launch
- pricing launch
- community launch
- international expansion
- AI feature release

## Severity Model

```text
L0 — No-go: launch-blocking issue.
L1 — Fix before launch.
L2 — Acceptable with mitigation.
L3 — Monitor after launch.
L4 — Ready.
```

Examples:

```text
L0: No privacy/terms for public data collection.
L0: Payment flow untested.
L0: No way to contact support.
L1: Missing rollback for risky feature.
L1: Analytics cannot measure key launch goal.
L2: Manual support acceptable for capped beta.
L3: SEO metadata can be improved after launch.
L4: All critical paths verified.
```

## Review Workflow

1. Identify launch type and audience.
2. Identify launch goal.
3. Identify must-work user journeys.
4. Check public claims and current-state accuracy.
5. Check technical readiness.
6. Check privacy/compliance readiness.
7. Check support/admin readiness.
8. Check measurement readiness.
9. Check rollback/kill switch.
10. Check comms.
11. Assign launch verdict.

## Output Contract

```text
Launch-readiness verdict:
Launch type:
Launch goal:
Audience:
Critical journeys:
Go/no-go:
L0 blockers:
L1 fixes:
Accepted risks:
Support readiness:
Compliance/trust readiness:
Technical readiness:
Measurement readiness:
Rollback/kill switch:
Comms readiness:
Decision:
```

Compact form:

```text
Launch verdict:
Blockers:
Required fixes:
Accepted risks:
Go / no-go:
```

## Launch Gate Categories

- product scope
- copy/claims
- domain/DNS/email
- auth/account
- waitlist/signup
- billing
- privacy/terms
- analytics
- support
- admin
- monitoring
- backups/data
- accessibility
- performance
- security
- regulatory
- comms
- rollback
- incident response

## Golden Rules

- No launch without a measurable goal.
- No public collection without privacy disclosure.
- No paid launch without tested billing/refund/cancel path.
- No risky feature without rollback or kill switch.
- No claims without evidence.
- No community/content feature without safety/reporting plan.
- No beta without feedback channel.
- No launch without support contact.

## References

Load as needed:

- `references/launch-checklists.md`
- `references/go-no-go-matrix.md`
- `references/beta-readiness.md`
- `references/paid-launch-readiness.md`
- `references/review-template.md`
