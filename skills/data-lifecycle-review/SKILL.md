---
name: data-lifecycle-review
disable-model-invocation: true
description: "Use when a privacy-sensitive product, SaaS, app, AI feature, data model, deletion/export spec, retention policy, telemetry pipeline, admin tool, or architecture doc needs a full lifecycle audit — collection, creation, storage, processing, sync, access, admin/support paths, analytics, AI, export, retention, deletion, backup, restore, logs, incidents, subprocessors. Traces data end-to-end and flags gaps and risk. Project-agnostic sub-reviewer lens under doc-reviewer. Canonical owner for data-flow and lifecycle reality. Distinct from trust-and-claims-review (claim accuracy, not data lifecycle). Pair with appropriate search/representation lenses when analytics, AI visibility monitoring, feeds, schema, or search snippets depend on data flows."
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
          - "data lifecycle"
          - "privacy"
          - "retention"
          - "deletion"
          - "telemetry"
          - "AI logs"
          - "backup"
      input_types:
        - "document"
        - "plan"
      primary_for:
---

# Data Lifecycle Review Skill

## Adjacent Agent Delegation

When triggered, also invoke:

- `opus-doc-reviewer` — the primary doc/component reviewer — orchestrates the doc-tier specialists.

## Purpose

Use this skill to review whether a product or feature has a coherent, truthful, and operationally supported data lifecycle.

Core question:

```text
What data exists, where does it go, who can access it, how long does it live, and how does it die?
```

## What This Skill Reviews

- data models
- PRDs
- architecture docs
- telemetry plans
- analytics events
- AI data flows
- admin tooling
- deletion/export features
- retention policies
- backup/restore design
- sync/offline flows
- support workflows
- incident logs
- subprocessors
- privacy/trust copy
- account deletion
- billing data

## Lifecycle Stages

Review every relevant stage:

```text
collect
create
validate
store
encrypt
sync
process
infer
index
cache
log
observe
share
export
access
administer
retain
delete
backup
restore
archive
anonymise
aggregate
train
dispose
```

## Severity Model

```text
D0 — Do not ship: lifecycle contradiction or sensitive data exposure.
D1 — Must fix before public release.
D2 — Should fix before merge/launch.
D3 — Document and monitor.
D4 — Lifecycle clear and controlled.
```

Examples:

```text
D0: Public deletion claim contradicted by backups/logs.
D0: Sensitive content sent to analytics/AI unintentionally.
D1: No retention period for personal data.
D1: Admin access to sensitive data without audit.
D2: Export excludes key user-owned data without explanation.
D2: Sync cache not covered by deletion spec.
D3: Manual deletion process acceptable for capped beta.
D4: Data map, retention, access, deletion, and restore semantics aligned.
```

## Review Workflow

1. Identify all data categories.
2. Map lifecycle stages.
3. Identify storage locations and subprocessors.
4. Identify access paths.
5. Identify derived/inferred data.
6. Identify logs/analytics/cache.
7. Identify retention/deletion/export semantics.
8. Identify backup/restore behaviour.
9. Compare public claims against lifecycle; route claim substantiation to `trust-and-claims-review` and search/AI representation to the appropriate search/representation lens.
10. Assign severity.

## Output Contract

```text
Data-lifecycle verdict:
Artefact:
Data categories:
Lifecycle map:
Storage locations:
Processing/inference:
Access/admin/support:
Analytics/logging:
Subprocessors/transfers:
Retention:
Deletion:
Backup/restore:
Export/portability:
Claims mismatch:
Severity:
Required changes:
Approved / not approved:
```

Compact form:

```text
Data lifecycle verdict:
Main lifecycle gap:
Severity:
Required change:
Approved / not approved:
```

## Golden Rules

- Data that is logged is still data.
- Data that is cached is still data.
- Derived data can be personal data.
- Deletion must include backups/restore semantics or explicitly exclude them.
- Export must define scope.
- Admin access must be intentional and audited.
- AI prompts/outputs are data.
- Analytics events can leak sensitive facts.
- Retention should be by purpose, not convenience.
- Public claims must match lifecycle reality; `trust-and-claims-review` owns claim severity and the search/AI representation lens owns representation of those claims.

## References

Load as needed:

- `references/data-map-template.md`
- `references/lifecycle-stages.md`
- `references/deletion-retention.md`
- `references/admin-access.md`
- `references/telemetry-ai-logs.md`
- `references/review-template.md`
