---
name: domain-modelling
description: "Use when contested or vague domain terms need to be pinned down — resolving terminology disputes during a design or implementation session, capturing decisions as ADRs, onboarding new ubiquitous-language entries into CONTEXT.md, or challenging fuzzy wording in docs and code. Active discipline: challenge conflicting terms the moment they appear and write the resolution down. Distinct from grill-with-docs (interrogates an existing design) and from opus-domain-modelling-reviewer (reviews domain terms in code/specs, not the writing discipline itself). Not for passive vocabulary reading."
---

**Pre-Flight:** Workflow Sanity Gates (`AGENTS.md` → "Workflow Sanity Gates"; detail at `~/.pi/agent/docs/sanity-gates.md`) — decisions captured here are downstream trigger points when they affect dependencies, schema, auth/authz, or security surfaces. Record, alongside the decision, the evidence check (transcript, ADR, MEMORY.md, AGENTS.md) used to confirm no prior acknowledgement, so the gates' evidence format is consistent with the ADR.

# Domain Modelling

Actively build and sharpen the project's domain model as you work. This is the _active_ discipline — challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise.

**Not this skill:** Reading `CONTEXT.md` for vocabulary (that's a one-line habit). This skill is for _changing_ the model, not consuming it.

## When to Use

- Resolving a contested or ambiguous domain term
- Making a decision that needs a durable record (ADR candidate)
- Challenging vague language during design
- Cross-referencing code against documented domain behaviour
- Onboarding a new domain concept into the glossary

## Domain Sources

### File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## Active Discipline

### Challenge conflicting terminology

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

When a term is used differently in code vs docs vs conversation, call it out immediately:

> "Your CONTEXT.md defines 'floor' as the minimum word count. Your spec says 'floor' is the target. Which is it?"

Silence on ambiguity lets it calcify. Surface it.

### Sharpen vague or overloaded language

When a term is ambiguous or used for multiple concepts:

**Overloaded example:** "account" — sometimes means the billing entity, sometimes the login credential, sometimes the subscription tier.

**Refinement:** Pick one canonical term per concept. Document alternatives under `_Avoid_`.

> "Use **Account** for the billing entity. Use **User** for the authenticated identity. Use **Subscription** for the billing tier."

### Stress-test with concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts:

> "You said a User has many Entries. Can an Entry have no words? Can a deleted User's Entries still exist? Can one Entry belong to two Users?"

Forces precision on boundaries that vague language glosses over.

### Cross-reference with code

When someone states how something works, check whether the code agrees. If you find a contradiction, surface it:

> "Your spec says entries are permanently deleted. Your code soft-deletes. Which is the truth?"

Contradictions between stated model and implementation are findings, not notes.

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

## ADR Decision Checklist

Before creating an ADR, confirm it meets the bar:

| Question                    | If no                       |
| --------------------------- | --------------------------- |
| Hard to reverse?            | Skip — reverse it if needed |
| Surprising without context? | Skip — nobody will wonder   |
| Real trade-off?             | Skip — it was obvious       |

What qualifies as ADR-worthy:

- Architectural shape (monorepo, event sourcing, write/read model split)
- Integration patterns between subsystems
- Technology choices with meaningful lock-in (database, auth, hosting)
- Boundary decisions (who owns this data, who can mutate it)
- Deliberate deviations from the obvious path
- Constraints not visible in code (compliance, contracts, SLAs)
- Rejected alternatives when the rejection is non-obvious

What doesn't:

- Obvious technical decisions (we picked Postgres because it fits the use case)
- Easy reversals (which UI library to try first)
- Implementation details (naming conventions, file structure within a module)
- Temporary experiments (flag with `// experiment: X` in code instead)

## Terminology Flags

Raise these as findings during any session:

| Flag                        | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| **Vague term**              | No precise definition; used differently by different people |
| **Overloaded term**         | Same word for distinct concepts without disambiguation      |
| **Silent inconsistency**    | Code and docs use different terms for the same concept      |
| **Undefined concept**       | Domain concept used without a definition                    |
| **Behaviour contradiction** | Code implements differently than docs describe              |

Flag these in findings. Resolve them in the session or hand off.

## Session Output

At session end, summarise:

1. **Terms resolved** — definitions added or sharpened
2. **Terms flagged** — vague/overloaded/contradictory, with proposed resolutions
3. **ADRs created** — title and one-line summary
4. **ADR candidates deferred** — what was discussed but not yet decided

## Boundaries

- Do not use this skill for reading vocabulary (that's passive, not modelling)
- Do not pad ADRs with sections that don't add value
- Do not create glossary entries for general programming concepts
- Do not delete ADR history — append and supersede

## Integration

- `opus-domain-modelling-reviewer` — enforces consistency after the fact
- `opus-doc-writer` — creates or formats ADRs
- `systematic-debugging` — contradictions between code and docs are findings
- `writing-plans` — domain clarity is a prerequisite for good task decomposition
