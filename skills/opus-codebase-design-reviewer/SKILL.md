---
name: opus-codebase-design-reviewer
disable-model-invocation: true
description: "Use when a new module, repository, or service is being added, or when an existing module's interface design is in question. Reviews module interfaces for depth, seam discipline, type colocation, testability; flags shallow wrappers, missing seams, and design debt. Triggered for design reviews, interface reviews, and '/opus-review-architecture' calls, and as a sub-reviewer under opus-reviewer. Distinct from opus-architect (Clean Architecture layer discipline across packages) and opus-code-quality-reviewer (broader maintainability). Operates on module structure, not file size — that is opus-code-complexity-review."
metadata:
  opus:
    role: sub-reviewer
    reviewer:
      category: code
      triggers:
        files:
          - "**/*.ts"
          - "**/*.tsx"
        concerns:
          - "interface design"
          - "depth"
          - "seam"
          - "testability"
          - "shallow module"
          - "type placement"
      input_types:
        - "diff"
        - "file"
        - "module"
        - "full-codebase"
      primary_for:
        - "architecture review"
---

# Codebase Design Reviewer

Reviews module interfaces for depth, seam discipline, type colocation, and testability.

## Adjacent Agent Delegation

When triggered, also invoke:

- `opus-code-quality-reviewer` — for code-quality context on the files under review.
- `opus-test-reviewer` — for test-coverage and regression context on the files under review.

## Vocabulary

| Term                   | Definition                                                                      |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Module**             | Anything with an interface and implementation — function, class, package        |
| **Interface**          | Everything a caller must know: types, invariants, ordering, error modes, config |
| **Depth**              | Leverage at the interface: behavior per unit of surface callers must learn      |
| **Seam**               | Place where behavior can change without editing that place                      |
| **Adapter**            | Concrete thing satisfying an interface at a seam                                |
| **Composed operation** | Single method doing multiple things atomically                                  |

## Findings

### Blocker

- Interface allows invalid state callers can reach
- No seam where implementation needs to vary (only one adapter exists)
- Types in shared bag, not near owning module, causing circular imports

### Major

- **Thin pass-through**: method is 1:1 mapping to a dependency (e.g., `repo.create()` = single INSERT)
- **Missing seam**: repository has no interface; tests must mock at the SQL level
- **Type sprawl**: all domain types in one file; no co-location with owning module
- **Overloaded method**: multiple modes with positional args; callers must know which applies
- **Server Action throws**: expected failures return exceptions instead of typed `Result<T>`
- **Duplicated mapping**: identical `mapRow` pattern repeated across modules

### Minor

- Interface has >7 methods; consider splitting
- Method has >5 parameters (use destructured object per ADR-0006)
- Documentation missing on non-obvious invariants

## Depth Check

Ask: **"What does a caller get per unit of interface they must learn?"**

### Shallow (refactor target)

```typescript
// Each call does one thing. Caller must know the sequence.
await repo.create(entry);
await repo.setPayloadId(entryId, payloadId);
await payloadRepo.create({ entryId, content });
```

### Deep (target)

```typescript
// One call. Implementation hides the sequence.
await repo.createEntryWithContent(entry, content);
```

**Rule:** If every caller uses the same sequence of shallow methods, compose them.

## Seam Check

**One adapter = hypothetical seam. Two adapters = real seam.**

```
No interface extracted yet.
┌─────────────────┐
│ PgUserRepository │ ← only adapter
└─────────────────┘

Interface extracted. Seam is real.
┌─────────────────────────┐
│     UserRepository      │  ← seam
├─────────────────────────┤
│ PgUserRepository         │  ← adapter 1 (prod)
│ FakeUserRepository       │  ← adapter 2 (test)
└─────────────────────────┘
```

Extract interface when:

- ≥2 implementations exist (real + test) OR
- ≥2 callers depend on it

## Type Colocation Check

**Types live next to the module that owns them.**

```
// Good
src/
  user-repository.ts   → User, NewUser, SafeUser
  entry-repository.ts  → Entry, NewEntry

// Bad
src/
  types.ts             → All domain types in one bag
```

**Exception:** Types used by 2+ independent modules → shared file with descriptive name.

## Testability Check

If the module is hard to test, its interface is wrong.

| Problem                            | Likely cause                       | Fix                          |
| ---------------------------------- | ---------------------------------- | ---------------------------- |
| Must mock `sql` to test repository | No repository interface            | Extract interface; mock that |
| Test setup is 50 lines             | Too many dependencies              | Compose into fewer calls     |
| Overloaded method                  | Ambiguous interface                | Split into named methods     |
| No unit tests exist                | Interface not designed for testing | Redesign interface           |

**The seam is the test surface.** If you can't test past the interface, the module is the wrong shape.

## Review Style

Terse. One finding per line with file:line reference.

```
// Blocker
src/auth/login.ts:23 — Throws on validation failure. Return Result<T>.

// Major
src/repo/entry-repository.ts:12 — Thin pass-through. compose with createPayload.
src/repo/user-repository.ts:47 — No interface. extract UserRepository for testability.
types/index.ts:156 — All domain types here. co-locate with owning modules.

// Minor
src/repo/entry-repository.ts:89 — 8 methods. consider splitting read vs write.
```

## Design Debt Triggers

Flag these patterns for design-debt tracking (a follow-up note, an issue, or an architecture log):

1. Thin pass-through methods (no added logic beyond the dependency call)
2. Duplicated row mapping across repositories
3. Overloaded methods with different parameter modes
4. Types in shared bag, not co-located
5. Server Actions that throw for expected failures
6. Repository with no interface and ≥2 callers

## When Invoked

- `/opus-review-architecture` — always
- New module, repository, or service added
- Restructuring an existing module's interface
- During full codebase audit (`opus-analyse`)
- Manual trigger: "design review", "interface review", "shallow module"

## Boundaries

- Read-only on code
- Writes findings to review output (no file edits)
- Delegates refactoring to `/opus-go` with a plan
- Design debt recorded in a follow-up note / issue / architecture log
