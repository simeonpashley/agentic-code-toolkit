# Refactoring Catalogue and Selection Guide

Use this reference to select an appropriate transformation. Apply patterns to solve a concrete pressure, not to satisfy a catalogue.

## Local transformations

### Rename

Use language-aware rename facilities. Preserve public aliases or re-exports when consumers may use the old name. Search dynamic strings and configuration separately.

### Extract function

Use when a coherent operation has a stable name, independent tests, repeated use, or hides distracting detail. Avoid extracting one-line wrappers that only add navigation.

### Inline function or variable

Use when indirection obscures rather than clarifies. Prove there are no extension, instrumentation, mocking, or compatibility reasons for the seam.

### Guard clauses and conditional decomposition

Use to make exceptional paths explicit and reduce nesting. Preserve evaluation order and side effects. Short-circuit changes can alter behaviour.

### Introduce parameter object

Use when parameters form a durable concept or evolve together. Avoid converting a simple stable call into a generic bag of options.

### Replace primitive with domain type

Use only if runtime and serialised boundaries remain compatible or a separately approved migration exists.

## Module and dependency transformations

### Move declaration or file

Move mechanically, update imports, and preserve public entry points where needed. Check package exports, path aliases, loaders, code generation and dynamic imports.

### Split module

Split along an existing responsibility or change boundary. Keep dependency direction explicit. Avoid creating circular dependencies or a collection of one-function files.

### Consolidate duplication

Consolidate only when duplicated code represents the same rule and is expected to change together. Similar syntax with different business meaning should remain separate.

### Introduce dependency seam

Use around volatile or external dependencies to improve testing or dependency direction. Keep the interface narrow and owned by the consumer. Do not create interfaces for every class.

### Branch by abstraction

For large internal replacement:

1. introduce a stable abstraction around current behaviour;
2. route callers through it;
3. add the replacement behind the same contract;
4. compare and migrate incrementally;
5. remove the old implementation only after verification.

This is useful for high-risk internals but does not legitimise public contract changes.

### Parallel change

For public compatibility:

1. expand by adding the new path while preserving the old;
2. migrate all consumers;
3. contract by removing the old path only after evidence and approval.

Schema and protocol changes remain migrations even when parallel change reduces risk.

## Object-oriented transformations

### Extract class

Use when a coherent responsibility has its own invariants, lifecycle, or collaborators. Do not create classes as folders for unrelated helpers.

### Replace conditional with polymorphism

Use when variants are stable, behaviour differs by type, and new variants are expected. A small explicit conditional may be clearer.

### Replace inheritance with composition

Use when subclasses violate substitutability, inherit unwanted behaviour, or need independent variation. Preserve lifecycle and method-resolution semantics.

### Factory or builder

Use when construction is complex, variable, or must enforce invariants. Do not hide a simple constructor behind ceremony.

## Functional and data-flow transformations

### Pure core, imperative shell

Separate calculation from I/O when it exposes deterministic tests and clearer side-effect boundaries.

### Pipeline extraction

Use for ordered transformations with explicit intermediate contracts. Preserve laziness, streaming, back-pressure, and error behaviour.

### State-machine extraction

Use when behaviour depends on explicit states and transitions. Characterise invalid transitions and persistence semantics first.

## Legacy-modernisation guidance

Modernisation is refactoring only when compatibility is preserved. Safe examples include replacing deprecated internal syntax, introducing typed boundaries, or moving behind a compatibility facade.

Treat these as migrations or feature work rather than incidental refactoring:

- framework or runtime major-version upgrades;
- database schema changes;
- API versioning;
- new async or concurrent execution;
- microservice extraction;
- authentication or authorisation redesign;
- changing deployment topology;
- replacing a library with materially different semantics.

## Performance-oriented restructuring

Require a benchmark and output-equivalence tests before editing. Preserve ordering, precision, resource limits, timeout and concurrency semantics.

Potential structural techniques include:

- avoid repeated parsing or allocation;
- move invariant work out of loops;
- batch equivalent I/O;
- introduce bounded caching with explicit invalidation;
- replace accidental quadratic traversal;
- stream large data where the API already permits it.

Do not claim improvement from theoretical complexity alone when realistic input sizes or external I/O dominate.

## Abstraction checks

Before introducing an abstraction, answer:

- Which concrete change pressure does it address?
- Which callers benefit?
- What dependency direction improves?
- What invariant does it centralise?
- What future variation is evidenced rather than imagined?
- Does the abstraction reduce concepts overall?

Prefer no abstraction when these answers are weak.
