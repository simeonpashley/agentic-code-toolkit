# Design It Twice

When interface shape is unclear, design it two (or three) different ways. Compare. Choose the deeper one.

Based on ["Design It Twice" (Ousterhout)](https://web.stanford.edu/~ouster/cgi-bin/aposd2ndEdExtract.pdf) — "the first idea is rarely the best".

See [SKILL.md](SKILL.md) for vocabulary.

## When to Use

- New module with unclear interface shape
- Restructuring an existing seam
- Unsure where to place logic (repository vs service vs action)
- Interface has ≥5 methods and splitting vs combining is unclear

**Don't use** when the interface is already constrained by product or technical requirements.

## Process

### 1. Frame the problem space

Write a brief covering:

- Constraints any new interface must satisfy
- Dependencies and their category (see [DEEPENING.md](DEEPENING.md))
- Illustrative code sketch to ground constraints (not a proposal)

Present to user, then proceed to Step 2.

### 2. Design alternatives

Design 2-3 radically different interfaces:

**Option A — Minimize interface**

```
Aim: 1-3 entry points. Maximize leverage per call.
```

**Option B — Maximize flexibility**

```
Aim: Support many use cases. Extensible.
```

**Option C — Optimize for common case**

```
Aim: Default path is trivial. Advanced use needs more calls.
```

Each design must specify:

1. Interface (types, methods, params, invariants, error modes)
2. Usage example showing callers
3. What implementation hides
4. Dependency strategy and adapters
5. Trade-offs: where is leverage high? Where is it thin?

### 3. Compare

Evaluate by:

| Criterion       | What it measures                                         |
| --------------- | -------------------------------------------------------- |
| **Depth**       | Leverage at the interface — behavior per unit of surface |
| **Locality**    | Where does knowledge concentrate — one place or spread?  |
| **Testability** | Can you test past the interface?                         |
| **Flexibility** | Can callers extend without modifying the module?         |

### 4. Recommend

Give a clear recommendation: which design is strongest and why.

If elements from different designs combine well, propose a hybrid.

## Example

### Problem: User registration flow

**Option A — Repository orchestrates**

```typescript
interface UserRepository {
  create(input: NewUser): Promise<SafeUser>;
}

// Caller orchestrates
const user = await userRepo.create({ email, password });
await emailService.sendVerification(user.email, token);
```

**Option B — Service orchestrates**

```typescript
interface RegisterService {
  register(input: NewUser): Promise<SafeUser>;
}

// Caller delegates
const user = await registerService.register({ email, password });
```

| Criterion   | Option A                      | Option B              |
| ----------- | ----------------------------- | --------------------- |
| Depth       | Low — caller must orchestrate | High — one call       |
| Locality    | Split — repo + caller         | Concentrated          |
| Testability | Harder — mock repo + email    | Easier — mock service |

**Recommendation:** Option B wins. Deeper interface, knowledge in one place, easier to test.

## Integration

- `opus-reviewer` → invokes this when interface shape is unclear during design review
- `writing-plans` → Self-Review step #4 triggers this when interface depth is uncertain
- Manual trigger: "design it twice", "alternative interfaces", "interface options"
