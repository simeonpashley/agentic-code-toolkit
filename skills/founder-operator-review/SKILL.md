---
name: founder-operator-review
disable-model-invocation: true
description: "Use when a product proposal, architecture, process, launch plan, support model, admin tool, billing flow, community feature, infrastructure choice, or compliance obligation needs to be checked for operational survivability for solo founders or small teams. Flags support burden, moderation burden, cost creep, incident load, bus factor, hidden manual work, and complexity beyond team capacity. Project-agnostic sub-reviewer lens under doc-reviewer. Distinct from launch-readiness-review (release-day gates, not steady-state operating load). Review-only — produces findings for the founder to act on."
license: Proprietary
compatibility: Project-agnostic; suitable for doc-reviewer orchestration.
metadata:
  version: "1.0"
  role: review-lens
  opus:
    role: sub-reviewer
    reviewer:
      category: docs
      triggers:
        files:
          - "**/*.md"
          - "**/docs/**"
        concerns:
          - "founder"
          - "operator"
          - "support burden"
          - "bus factor"
          - "cost creep"
          - "manual work"
          - "operational"
      input_types:
        - "document"
        - "plan"
      primary_for:
---

# Founder Operator Review Skill

## Adjacent Agent Delegation

When triggered, also invoke:

- `opus-doc-reviewer` — the primary doc/component reviewer — orchestrates the doc-tier specialists.

## Purpose

Use this skill to review whether a proposed artefact is operationally survivable for a solo founder or small team.

A feature can be strategically good, technically feasible, and still operationally fatal.

Core question:

```text
Can the current team operate this safely, affordably, and consistently?
```

## What This Skill Reviews

- feature specs
- roadmaps
- MVP scope
- launch plans
- admin tools
- support processes
- moderation/community features
- billing/refunds
- infrastructure choices
- incident response
- analytics/observability
- compliance obligations
- integrations
- AI features
- enterprise requests
- bespoke customer commitments

## Severity Model

```text
O0 — Do not ship: unsustainable or unsafe operational burden.
O1 — Must simplify or automate before release.
O2 — Defer, batch, or manually cap.
O3 — Acceptable with monitoring/runbook.
O4 — Operator-safe.
```

Examples:

```text
O0: Public community with no moderation capacity.
O0: 24/7 support promise by solo founder.
O1: Manual billing/refund workflow with no audit trail.
O1: Critical job with no retry/visibility.
O2: Feature can ship to capped beta only.
O3: Manual process acceptable under explicit threshold.
O4: Low-support, reversible, observable feature.
```

## Review Workflow

1. Identify current team capacity.
2. Identify new recurring work.
3. Identify support tickets likely created.
4. Identify moderation/safety/compliance obligations.
5. Identify incident/failure modes.
6. Identify cost drivers.
7. Identify automation/admin needs.
8. Identify kill switch/rollback path.
9. Assign severity.
10. Recommend simplify, cap, automate, defer, or reject.

## Output Contract

```text
Founder-operator verdict:
Team/capacity assumption:
New operational burden:
Support burden:
Moderation/safety burden:
Compliance/admin burden:
Infra/cost burden:
Incident/failure burden:
Manual work created:
Missing tooling/runbooks:
Severity:
Decision:
Required changes:
Approved / not approved:
```

Compact form:

```text
Operator verdict:
Main burden:
Severity:
Required change:
Approved / not approved:
```

## Golden Rules

- Manual is acceptable only when volume is capped.
- Every public promise creates an operational obligation.
- Every community feature creates moderation work.
- Every payment feature creates support and audit work.
- Every deletion/privacy feature creates support and compliance work.
- Every integration creates external dependency work.
- Every AI feature creates explanation, safety, and edge-case work.
- If it cannot be observed, it cannot be operated.
- If it cannot be reversed, it needs more review.

## References

Load as needed:

- `references/burden-types.md`
- `references/operator-decision-matrix.md`
- `references/runbook-checklist.md`
- `references/review-template.md`
