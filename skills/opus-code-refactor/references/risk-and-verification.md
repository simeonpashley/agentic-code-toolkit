# Risk and Verification

Read this reference for cross-module, public-surface, security, persistence, concurrency, build or performance-sensitive refactors.

## Risk classification

### Low

Typical examples:

- local rename with language-aware tooling;
- extraction inside one module;
- guard-clause simplification;
- removal of proven dead private code.

Evidence: compiler/type checks plus focused tests may be sufficient during each step, followed by the repository's standard final checks.

### Medium

Typical examples:

- module split or file moves;
- dependency inversion;
- cross-package internal rename;
- central shared helper consolidation;
- changes to error or side-effect plumbing.

Evidence: targeted unit and integration tests, import/reference audit, full build and full authoritative suite.

### High

Typical examples:

- public package or plugin surfaces;
- persistence and transactions;
- auth, security or privacy boundaries;
- concurrency, queues, retries or distributed state;
- build/deploy/routing systems;
- broad rewrites or replacements;
- performance-sensitive paths with timing-dependent behaviour.

Evidence: explicit contract inventory, characterisation tests at stable boundaries, integration or end-to-end verification, rollout/rollback strategy, and independent review. Some cases should be reclassified as migration work.

## Verification ladder

Use the levels relevant to the affected surface:

1. Parse/format.
2. Compile/type-check.
3. Focused unit tests.
4. Contract and characterisation tests.
5. Integration tests with real boundaries where practical.
6. Build/package generation.
7. End-to-end or system tests.
8. Static security and dependency checks.
9. Benchmark or resource comparison.
10. Production-like smoke or canary validation when authorised.

Passing a lower level does not replace a required higher level.

## Reference audit after moves and renames

Search separately for:

- symbol identifiers;
- import and export names;
- file and module paths;
- aliases and package export maps;
- dynamic import strings;
- reflection and registration keys;
- dependency-injection tokens;
- serialisation type names;
- configuration and environment keys;
- CLI flags and help text;
- routes, template names and asset paths;
- mocks, fixtures, snapshots and test discovery patterns;
- documentation, examples and scripts;
- metrics, log fields, tracing names and alert queries.

Use the compiler and language server first. Use `rg` or equivalent to cover string-based and non-code references.

## Concurrency and ordering

Refactors can change behaviour by altering:

- lock scope or acquisition order;
- callback or promise scheduling;
- iteration order;
- batch boundaries;
- transaction lifetime;
- retry timing;
- duplicate suppression;
- cancellation and timeout propagation;
- shutdown or resource cleanup.

Lock these behaviours with stress, deterministic scheduler, integration, or race-detection tools available in the repository.

## Security-sensitive work

Do not preserve behaviour blindly when it is unsafe. Stop and surface:

- authentication or authorisation bypass;
- secret exposure;
- unsafe deserialisation;
- injection risk;
- weakened validation;
- changed trust boundary;
- insecure randomness or cryptography;
- audit-log loss.

Separate remediation from the refactor and route it through the repository's security and approval process.

## Performance evidence

A useful benchmark states:

- workload and input distribution;
- warm-up and iteration count;
- environment and resource limits;
- baseline median and tail values;
- variance or confidence;
- output-equivalence checks.

Measure the bottleneck that motivated the change. Avoid microbenchmarks that omit the dominant system cost.

## Rollback

A refactor should be reversible to the last verified state. For large changes, use one or more of:

- small commits when the user has requested commits;
- compatibility facade;
- feature flag for internal implementation selection;
- parallel implementation comparison;
- incremental caller migration;
- deployment canary.

Do not introduce a runtime flag solely to mask unverified structural work.

## Independent review triggers

Request another reviewer when:

- five or more modules/packages are touched;
- public compatibility is involved;
- tests cannot fully observe the contract;
- persistence, security, concurrency or deployment is affected;
- the diff is difficult to reason about mechanically;
- benchmark claims influence the decision.
