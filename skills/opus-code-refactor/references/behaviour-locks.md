# Behaviour Locks and Characterisation Tests

Read this reference when coverage is absent, indirect, unstable, or poorly aligned with the refactoring surface.

## Purpose

A behaviour lock is evidence that the externally observable contract remains unchanged while internals move. It is not proof that current behaviour is correct.

## Contract inventory

Inspect the affected surface for:

1. Inputs: values, defaults, encodings, validation, environment, time, locale.
2. Outputs: values, errors, status codes, text, order, serialisation.
3. State: mutations, persistence, cache, transaction and lifecycle state.
4. Interactions: file, network, database, queue, process, callback, event and plugin calls.
5. Temporal behaviour: retries, timeouts, debouncing, scheduling, ordering, idempotency.
6. Compatibility: import paths, exports, public types, CLI flags, config keys and data shapes.
7. Operations: logs, metrics and traces that alerts, dashboards or support processes depend on.
8. Non-functional contracts: accessibility, security constraints and explicit performance budgets.

## Test selection hierarchy

Prefer the narrowest stable seam that observes the behaviour at risk:

1. Existing contract or integration test at the public boundary.
2. Focused unit test against a stable public API.
3. Characterisation test around a legacy seam.
4. Golden-master comparison for complex but deterministic output.
5. Recorded interaction test for external side effects.
6. End-to-end test when no lower seam is reliable.

Avoid asserting private helper calls merely because the code is hard to test. That locks the old structure and prevents the refactor.

## Characterisation test procedure

1. Choose representative normal, boundary, invalid, and failure inputs.
2. Capture the current output and externally observable interactions.
3. Review the captured result. Remove unstable data that is not part of the contract.
4. Freeze nondeterminism:
   - inject or fake time;
   - seed randomness;
   - fix locale and timezone;
   - isolate environment variables;
   - stub external systems at a stable boundary.
5. Name the test after the observed contract, not the current implementation.
6. Run it repeatedly to detect flakiness.
7. Keep assertions precise enough to detect drift but not private rearrangement.

## Golden-master guidance

Use golden files when output is large and reviewable, such as generated documents, serialised payloads, compiler output or formatted reports.

Do not use an opaque snapshot as a substitute for understanding. Normalise unstable fields, review the fixture, and keep the diff human-readable.

## Side effects

For side-effectful code, lock:

- destination and payload;
- call count where meaningful;
- ordering when contractually relevant;
- transaction or rollback behaviour;
- retry and duplicate handling;
- failure propagation and compensation.

Prefer a test double at the external boundary rather than mocking every internal collaborator.

## Weak evidence patterns

Do not rely solely on:

- line coverage percentage;
- tests that only instantiate the object;
- snapshots containing unstable values;
- mocks coupled to private implementation;
- happy-path tests for error-sensitive code;
- type-checking when runtime behaviour is at risk;
- manual inspection for repeatable behaviour.

## When no lock is practical

For a low-risk local transformation, compiler checks and callers' tests may be sufficient if the reasoning is explicit.

For a high-risk surface, inability to construct meaningful evidence is a stop condition. Introduce a seam first, narrow the scope, or plan a migration with stronger observability.
