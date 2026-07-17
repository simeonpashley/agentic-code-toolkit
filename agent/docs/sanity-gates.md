# Workflow Sanity Gates

**Holder:** this file. Referenced from `AGENTS.md`. Full detail lives here; AGENTS.md only carries the trigger list and a link.

[doc] Apply at every trigger point listed in AGENTS.md. None of these flags is a guess — each must cite the evidence that grounds it.

---

## 1. Risks not yet acknowledged

For each risk the user has not explicitly weighed in this transcript, in `docs/adr/`, in `MEMORY.md`, or in `AGENTS.md`:

| Field          | Value                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Category**   | `data loss` \| `security regression` \| `cost` \| `schedule` \| `dependency lock-in` \| `performance` \| `vendor` \| `regulatory` \| `irreversibility`  |
| **Severity**   | `Critical` \| `Important` \| `Minor`                                                                                                                    |
| **Evidence**   | Where you looked and what was missing. Example: _"not in transcript; `docs/adr/` index has no auth-storage entry; MEMORY.md silent on session-vs-JWT."_ |
| **Mitigation** | Concrete action the user can accept, defer, or reject.                                                                                                  |

Do not raise a risk you cannot ground in evidence — find the source of the assumption first or admit you don't know.

---

## 2. Missing evidence

Format every item as: `Need: <artefact or question>; Without it: <what decision is deferred>`.

Examples:

- `Need: row count for users; Without it: cannot size migration lock window.`
- `Need: explicit user decision on session-storage vs. JWT; Without it: every subsequent auth change is provisional.`
- `Need: load profile for the new endpoint; Without it: cannot justify the chosen cache TTL.`

Do not commit against a hand-wave. If the evidence does not exist, refuse to proceed and ask for it.

---

## 3. Edge cases not yet covered

Pick the categories that fit the artefact's domain. Never borrow from an unrelated category without justification.

- **API**: empty list, 4xx vs 5xx split, authn/authz, pagination, concurrent writers, retry storms, clock skew.
- **Data**: null, missing key, duplicate, very large, very old, partial write, replay, idempotency.
- **UI**: empty state, error state, slow network, partial render, screen-reader path, focus order, keyboard-only path.
- **Async / background work**: cancellation, deadline expiry, partial completion, downstream-queue backpressure.
- **Multi-tenant / multi-region**: tenant isolation, region failover, cross-region consistency, replication lag.
- **Operations**: deploy-time vs. run-time behaviour, config drift, secret rotation, log redaction.

For every category you claim is covered, name the concrete case that proves it. If you cannot name a case for a category, write _"none identified"_ — that is the load-bearing answer, not a cop-out.

---

## 4. Test strategy

For the proposed change, name:

| Field              | Value                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Test type**      | `unit` \| `integration` \| `contract` \| `e2e` \| `manual`                                            |
| **Failure pinned** | The regression or invariant that becomes impossible if the test stays green.                          |
| **Location**       | Repo path. Respect `docs/testing-strategy.md` placement.                                              |
| **Out of scope**   | Specific behaviour that is intentionally not covered and why (e.g., third-party SaaS we cannot test). |

If the change cannot cite at least one test type that pins a specific failure, escalate as **Underspecified**.

---

## 5. Escalation: unsafe / impossible / underspecified

Refuse to proceed at any trigger point when the task fits one of these buckets. Each escalation must end with one line: `Unblock by: <concrete action>`.

| Bucket                     | Refuse when...                                                      | Examples                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unsafe**                 | The task has a specific failure mode the user has not acknowledged. | Delete rows without backup; drop prod column without rollback; force-push shared history; secrets in logs; prod migration whose lock window exceeds the documented SLA; share a token past its revocation date. |
| **Impossible (principle)** | Violates a physical, mathematical, or explicit-record constraint.   | "Deduplicate SHA-256 hashes"; "store 5 PB in a 10 GB quota"; "ship before Y" when Y already shipped without a migration path.                                                                                   |
| **Impossible (context)**   | Feasible in principle, blocked here.                                | Missing access token; no prod-like test environment available; upstream API in maintenance; required permission not yet granted.                                                                                |
| **Underspecified**         | The smallest set of decisions needed to proceed is missing.         | Trade-offs the user has not picked; ambiguous requirements; two sources contradict each other; success criteria absent.                                                                                         |

When you escalate, restate the task in one sentence, name the bucket, list the unblocker. Do not continue past the gate.

---

## Worked example — before recommending a schema change

Trigger: _"I'm going to change the `users.email` column to be unique."_

**Risks not yet acknowledged**

- _Category: data loss | Severity: Critical | Evidence: not in transcript; no ADR under `docs/adr/` for email-uniqueness; MEMORY.md silent on dedup strategy. | Mitigation: write an ADR with the dedup strategy and rollback before applying._ ✅
- _Category: irreversibility | Severity: Important | Evidence: `email` is referenced by 7 indexes per `git grep -l email`; dropping the underlying duplicates will break FK from `sessions.user_id` once we move to soft-delete. | Mitigation: enumerate dependents and ship a green/green migration that proves no row is destroyed._ ✅

**Missing evidence**

- `Need: current duplicate count for users.email; Without it: cannot estimate the dedup pass cost or backfill window.`
- `Need: explicit user approval for lock-window policy (expect up to 30s write-block); Without it: cannot apply in prod without breaching the SLA in `docs/operational/sla.md`.`

**Edge cases not yet covered**

- _API: empty result on `/users?email=` after dedup; what 404 vs 200 semantics? — none identified._
- _Async: a write-pending job at the moment of the lock — none identified, pending evidence above._

**Test strategy**

- _Test type: integration | Failure pinned: re-applying the migration against a fixture with two identical emails must error, not silently dedupe. | Location: `tests/migrations/email_unique.test.ts`._

**Escalation**: none — applying after the above is acknowledged.

`Unblock by: <none — proceed once risks + missing evidence are resolved>.`

---

## Anti-patterns

- **Asking for permission instead of grounding a flag.** A risk or missing-evidence item that does not name where you looked is decoration. Refuse to emit it.
- **Asserting coverage without a case.** "I considered edge cases" with no named case is not coverage. Either name it or write _"none identified"_.
- **Burying the gate in prose.** Escalation must be its own section with `Unblock by:` at the end. Do not weave it into a paragraph where it can be skimmed past.
- **Treating triggers as suggestions.** Plan, claim-done, irreversible shell action, and security/design commits are not optional moments — they are the four points at which this file applies. If you are inside one, the gates are live.
