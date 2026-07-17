---
name: trust-and-claims-review
disable-model-invocation: true
description: "Use when product, marketing, trust, privacy, security, AI, performance, pricing, support, or comparison claims appear — websites, docs, PRDs, launch copy, app-store pages, trust pages, privacy and security copy, pricing pages, sales collateral, support macros. Checks whether each claim matches implementation reality and available evidence; flags overclaiming, future-state versus current-state drift, missing substantiation, trust contradictions, and claims requiring legal, security, privacy, or compliance escalation. Project-agnostic sub-reviewer lens. Canonical owner for claim substantiation, evidence adequacy, and claims-risk severity. Pair with appropriate search/representation lenses when claims feed SEO, snippets, schema, or AI answer surfaces."
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
          - "**/*.html"
        concerns:
          - "trust"
          - "claims"
          - "overclaiming"
          - "evidence"
          - "substantiation"
          - "privacy claims"
          - "security claims"
          - "marketing"
      input_types:
        - "document"
        - "plan"
      primary_for:
---

# Trust and Claims Review Skill

## Adjacent Agent Delegation

When triggered, also invoke:

- `opus-doc-reviewer` — the primary doc/component reviewer — orchestrates the doc-tier specialists.
- `neurodivergent-ux-review` — cognitive load, sensory, time, executive function, predictability, attention, working memory, reading, motor, anxiety, routine.

## Purpose

Use this skill to review claims made by a product, organisation, or artefact.

A **claim** is any statement that creates a user, buyer, regulator, partner, investor, or internal stakeholder expectation.

Claims include obvious marketing claims:

```text
secure
private
fast
trusted
best
AI-powered
GDPR compliant
```

and implicit claims created by UI, pricing, onboarding, trust pages, screenshots, badges, roadmap statements, feature labels, or comparison tables.

## Core Question

```text
Does every claim match current reality, evidence, scope, and user expectation?
```

## What This Skill Reviews

- privacy claims
- security claims
- AI claims
- AI-generated statistics, citations, or sources
- model-upgrade and automation-quality claims
- SEO, ranking, traffic, visibility, or citation claims
- performance claims
- reliability claims
- compliance claims
- accessibility claims
- medical/health/wellness claims
- customer/traction claims
- pricing/discount claims
- comparison claims
- roadmap/current-state claims
- deletion/export/retention claims
- support/SLA claims
- “free”, “unlimited”, “lifetime”, “anonymous”, “no tracking”, “no AI”, “no humans in the loop” wording

## What This Skill Does Not Do

This skill does not replace legal, security, privacy, regulatory, technical, data-lifecycle, or discoverability review.

It identifies claim risk and asks for evidence. It does not certify that a claim is legally safe, that the underlying system is secure, or that search/AI systems can find and represent the page correctly.

Use a search/AI-surface structure review for crawlability, indexability, schema alignment, citable-passage layout, citation role/position monitoring, and citation-to-click reporting.

## Severity Model

```text
T0 — Do not ship: false, misleading, unsafe, or high-risk claim.
T1 — Must fix before public release: claim likely overbroad or unsupported.
T2 — Should fix: vague, inflated, or future/current-state ambiguity.
T3 — Document and monitor: acceptable if evidence is maintained.
T4 — Clear: claim is scoped and supported from available facts.
```

Examples:

```text
T0: “anonymous” while collecting email, IP, payment, or device identifiers.
T0: “end-to-end encrypted” before E2EE exists.
T0: “clinically proven” without clinical evidence and review.
T0: Fabricated statistics, sources, reviews, citations, customers, or endorsements.
T1: “secure deletion” without backup/log/tombstone semantics.
T1: “trusted by thousands” without real users.
T1: “AI found safe keywords” without criteria, measurement, and review.
T1: “one model upgrade improved SEO/content quality” without measured outcomes and scope.
T2: “fast” without a metric or context.
T2: “AI-powered” without explaining what AI does.
T2: “no humans in the loop” without explaining verification, ownership, and escalation.
T3: “99.9% uptime target” if marked as target and tracked.
T4: “No public profiles in the current release” if true.
```

## Review Workflow

1. Extract every explicit and implicit claim.
2. Classify the claim type.
3. Mark current-state, planned, target-state, or aspirational.
4. Identify the evidence required.
5. For generated statistics, sources, citations, or comparisons, identify who verified them and where the source data lives.
6. Compare with implementation and operations.
7. Scope or rewrite overbroad claims.
8. Flag contradictions.
9. Assign severity.
10. Recommend evidence, wording, or escalation.

## Output Contract

```text
Trust-and-claims verdict:
Artefact:
Claim inventory:
Highest severity:
Unsupported claims:
Future/current-state drift:
Contradictions:
Required evidence:
Required rewrites:
Escalation needed:
Approved / not approved:
```

Compact form for orchestrators:

```text
Trust/claims verdict:
Highest-risk claim:
Required rewrite/evidence:
Escalation:
Approved / not approved:
```

## Golden Rules

### 1. Current-State Beats Roadmap

Never let public copy imply planned features exist today.

Use labels:

```text
available now
planned
target-state
beta
experimental
not yet implemented
```

### 2. Absolute Claims Need Exceptional Evidence

Flag:

```text
always
never
fully
complete
guaranteed
anonymous
unlimited
permanent
secure
private
safe
best
certified
compliant
```

### 3. Privacy/Security Claims Must Be Precise

Prefer:

```text
Your private content is not used for advertising.
```

over:

```text
Your data is completely private.
```

### 4. Trust Pages Are Product Surfaces

Trust pages must match actual systems, incident process, subprocessors, support access, logs, backups, and admin tooling.

### 5. Comparison Claims Must Be Fair

Comparison pages should state who the competitor is better for and what the reviewed product deliberately does not do.

### 6. Generated Evidence Is Not Evidence

Generated statistics, citations, sources, screenshots, logos, rankings, or internal links must be verified before they support a public claim.

Require:

```text
source identity
methodology or selection criteria
date or time window
responsible owner
verification status
scope and limitations
```

### 7. Automation Claims Need Outcome Evidence

A model upgrade, automation pipeline, or “no humans in the loop” statement does not prove quality. If it implies better SEO, safer keywords, better content, lower risk, or faster publication, require measured outcomes and a review path.

## References

Load as needed:

- `references/claim-types.md`
- `references/high-risk-phrases.md`
- `references/evidence-matrix.md`
- `references/rewrite-patterns.md`
- `references/review-template.md`
