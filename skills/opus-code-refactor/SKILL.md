---
name: opus-code-refactor
disable-model-invocation: true
description: >
  Use when restructuring existing code without intentionally changing externally
  observable behaviour: extract, inline, rename, move, split, consolidate, simplify,
  decouple, reduce duplication, introduce seams, improve dependency direction, or
  modernise internals behind stable contracts. Requires a green baseline, explicit
  behaviour locks, bounded scope, reversible steps, and verification after each
  transformation. Do not use for feature work, bug fixes, dependency/framework
  upgrades, schema or wire-format migrations, public API changes, or speculative
  rewrites unless those changes are separated and approved.
---

# Opus Code Refactor

Improve structure while preserving observable behaviour. Evidence, not intent, is the safety mechanism.

## Core contract

A refactor may change implementation structure, names, boundaries, dependencies, and internal organisation. It must preserve all behaviour that callers, users, operators, data consumers, or deployment systems can observe.

Observable behaviour can include:

- public APIs, exports, import paths, types, CLI flags, and exit codes;
- return values, errors, validation, ordering, formatting, and serialisation;
- database, file, network, cache, queue, and other side effects;
- side-effect count and ordering where callers depend on them;
- authentication, authorisation, privacy, and security properties;
- concurrency, idempotency, retries, timeouts, and transaction boundaries;
- logs, metrics, and tracing where they form an operational contract;
- accessibility, generated artefacts, configuration, and deployment behaviour;
- performance budgets when performance is an explicit acceptance criterion.

If the requested work requires changing one of these contracts, split that part into a separately planned and tested behaviour change.

## Read repository instructions first

Before editing:

1. Read the nearest applicable `AGENTS.md` files and repository documentation.
2. Inspect package/build manifests, test configuration, CI, linters, formatters, and generated-code rules.
3. Identify repository-specific sanity gates, protected paths, and required commands.
4. Read only the supporting reference needed for the task:
   - Behaviour locks and characterisation tests: `references/behaviour-locks.md`
   - Pattern selection and large-refactor techniques: `references/refactoring-catalogue.md`
   - Risk classification and verification depth: `references/risk-and-verification.md`

Repository instructions override this general workflow.

## Route before acting

Do not proceed as a refactor when:

- the baseline test or build state is failing for reasons unrelated to the proposed work;
- the desired outcome changes product behaviour or fixes a known bug;
- a dependency or framework upgrade is the primary change;
- database schema, persistent data, protocol, event, or wire-format migration is required;
- public compatibility cannot be preserved and no migration plan is approved;
- the scope is too broad to state concrete invariants and reversible steps;
- no practical test, contract check, or observational comparison can protect a high-risk surface.

Route those cases to debugging, planning, migration, security, or test-driven feature work as appropriate.

## Workflow

### 1. Establish the baseline

Before changing code:

1. Record the current branch and working-tree state. Do not overwrite unrelated user changes.
2. Discover the repository's authoritative verification commands from manifests and CI.
3. Run the smallest complete baseline appropriate to the scope:
   - compile or type-check;
   - targeted tests for the affected surface;
   - lint or static analysis where it protects semantics;
   - build or integration checks when the changed code participates in them.
4. Record pre-existing failures exactly. Do not silently absorb them into the refactor.
5. Identify the refactoring surface: entry points, callers, dependencies, tests, configuration, generated artefacts, and runtime integrations.

A failing relevant baseline means stop and investigate. Refactoring on an unstable baseline makes behavioural attribution unreliable.

### 2. Define the behaviour lock

State the invariants before editing.

Use a concise contract table:

| Surface      | Behaviour that must remain unchanged    | Evidence                       |
| ------------ | --------------------------------------- | ------------------------------ |
| Public API   | Signatures, exports, import paths       | Type checks and contract tests |
| Output       | Values, errors, serialisation, ordering | Unit or golden tests           |
| Side effects | Calls, writes, events, transactions     | Integration tests or spies     |
| Operations   | Logs, metrics, latency budget           | Trace or benchmark comparison  |

Audit coverage for the exact surface. Existing tests qualify only when they observe the behaviour at risk.

Where evidence is missing, add characterisation tests before structural changes. Prefer tests at stable public seams. Freeze time, randomness, locale, environment, and external services where needed. Do not encode accidental implementation details unless they are genuinely observable contracts.

### 3. Bound the scope

Write a short refactor plan containing:

- **Goal:** the structural problem being addressed.
- **In scope:** named files, symbols, modules, or dependency edges.
- **Out of scope:** behaviour changes, adjacent cleanup, upgrades, and unrelated formatting.
- **Preserved contracts:** concrete invariants from the behaviour lock.
- **Sequence:** one reversible transformation per step.
- **Risk:** low, medium, or high, with the reason.
- **Rollback:** how to return to the last verified state.

Separate mechanical transformations from semantic restructuring. Perform mechanical moves and renames first so later diffs remain reviewable.

If the scope expands, stop and re-scope. Do not turn local cleanup into an unbounded rewrite.

### 4. Choose the smallest suitable transformation

Prefer simple transformations with direct evidence:

- rename symbol using language-aware tooling;
- extract or inline function, variable, class, or module;
- move declaration while preserving compatibility;
- split a module along existing responsibilities;
- consolidate genuinely equivalent duplication;
- replace nested conditionals with guards;
- introduce a narrow seam around an external dependency;
- invert a dependency at a stable interface;
- replace temporary delegation after callers have migrated;
- remove dead indirection only after proving no static or dynamic consumers.

Do not introduce patterns, interfaces, factories, dependency injection, or abstraction merely because they are fashionable. Require a concrete pressure: multiple implementations, test seam, dependency direction, volatility boundary, or repeated change cost.

Prefer composition where it reduces coupling, not as a universal rule. Preserve the repository's existing architectural vocabulary unless changing it is an explicit objective.

### 5. Execute the refactor loop

For each planned transformation:

1. Make one structural change.
2. Use compiler, language server, IDE refactor, or codemod facilities where available.
3. Inspect the diff immediately for unrelated edits and accidental semantic changes.
4. Run the fastest relevant checks:
   - formatter on touched files only;
   - compile or type-check;
   - targeted tests;
   - relevant lint/static analysis.
5. If a lock fails:
   - stop;
   - revert or isolate the last transformation;
   - determine whether the implementation changed behaviour or the lock was invalid;
   - never weaken a valid test to make the refactor pass.
6. Continue only from a verified state.

Run broader integration or full-suite checks at sensible milestones and at completion. For very slow suites, targeted checks may support the inner loop, but they do not replace the final authoritative suite.

Do not combine extraction, rename, move, API redesign, dependency upgrade, and behaviour correction in one diff. Each should be attributable and reversible.

### 6. Handle discoveries correctly

During refactoring:

- Record discovered bugs; do not fix them in the same behavioural-preservation change.
- Record obsolete tests; do not delete or rewrite them unless their protected behaviour is proven irrelevant and separately approved.
- Record security concerns and stop when the current design is unsafe to preserve.
- Avoid broad formatting churn.
- Do not edit generated output directly; change the source or generator.
- Preserve compatibility shims when external callers may rely on an old path or symbol.
- Keep comments that explain constraints; remove comments that merely narrate superseded mechanics.

### 7. Completion gate

Before reporting completion:

1. Run the repository's authoritative full verification commands.
2. Confirm all behaviour locks still pass unchanged.
3. Run build, type-check, lint, integration, contract, and end-to-end checks required by the affected surface.
4. Audit moved or renamed references separately:
   - direct calls and type references;
   - imports, exports, re-exports, and barrel files;
   - dynamic imports, reflection, registries, dependency containers;
   - configuration, environment keys, templates, migrations, fixtures;
   - string literals, error text, logs, metrics, and telemetry names;
   - tests, mocks, docs, examples, scripts, and generated manifests.
5. Check for circular dependencies, layering regressions, duplicate implementations, and dead compatibility code.
6. Compare relevant before/after metrics only where they were part of the goal:
   - complexity or dependency count;
   - build size or build time;
   - benchmark latency, throughput, allocations, or memory.
7. Review the final diff for scope discipline and accidental behaviour change.
8. For high-risk or cross-boundary work, request an independent review.

Do not claim performance improvement without a repeatable benchmark. Do not claim reduced complexity solely from line-count reduction.

## Risk triggers

Treat the refactor as high risk when it touches:

- authentication, authorisation, secrets, cryptography, or security boundaries;
- persistence, transactions, data models, migrations, or cache consistency;
- concurrency, distributed coordination, retries, queues, or idempotency;
- public libraries, plugin APIs, SDKs, protocols, or external integrations;
- build, deployment, infrastructure, routing, or generated artefacts;
- dependency injection roots, global state, initialisation order, or shutdown;
- broad renames, file moves, or module splits across package boundaries;
- performance-sensitive code where timing or allocation affects correctness.

For high-risk work, read `references/risk-and-verification.md` and require stronger integration or contract evidence before editing.

## Non-negotiable rules

- Preserve behaviour; separate intentional changes.
- Keep the baseline green.
- Add missing behaviour locks before restructuring.
- One attributable transformation at a time.
- Prefer automated semantic refactors over text replacement.
- Never weaken tests to legitimise drift.
- Never fix unrelated bugs in the same change.
- Never upgrade dependencies as incidental cleanup.
- Never change persistent or wire formats under the label of refactoring.
- Never preserve an unsafe security behaviour without escalating it.
- Never claim completion without running the stated verification.
- Never introduce abstraction without a demonstrated maintenance benefit.
- Leave the codebase in a verified state after every meaningful step.

## Completion report

Report:

### Scope

- Structural goal
- Files or modules changed
- Preserved contracts
- Intentional exclusions

### Transformations

- Ordered list of structural changes
- Compatibility mechanisms retained or removed

### Verification

- Baseline commands and result
- Characterisation or contract tests added
- Per-step checks
- Final authoritative commands and result
- Benchmarks or metrics, where relevant

### Outcome

- Structural improvement achieved
- Residual risks
- Discovered bugs or follow-up work kept separate
- Human decisions still required
