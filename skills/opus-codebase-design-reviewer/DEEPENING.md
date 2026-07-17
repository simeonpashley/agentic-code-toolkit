# Deepening

How to deepen a cluster of shallow modules safely, given their dependencies.

See [SKILL.md](SKILL.md) for vocabulary.

## Dependency Categories

Classify dependencies before deepening. Category determines testing strategy.

### 1. In-process

Pure computation, no I/O. **Always deepenable.**

```typescript
// Before: 3 separate functions caller must compose
calculateDate(iso, timezone)
calculateWordCount(text)
formatEntry(date, words)

// After: one composed function
buildEntry({ iso, timezone, text }) → Entry
```

Merge shallow helpers. Test through the new interface directly. No adapter needed.

### 2. Local-substitutable

A test stand-in exists locally. **Deepenable when stand-in available.**

```typescript
// Test: fake DB client
const fakeSql = buildFakeSql({ users: [existingUser] });
const repo = new PgUserRepository(fakeSql);

// Prod: real DB client
const repo = new PgUserRepository(sql);
```

Seam is internal — the test harness stands in for the real dependency. No external port needed.

### 3. Remote but owned

Own service across a network boundary. **Define a port, inject the adapter.**

```typescript
// Port — defined in domain
interface EmailPort {
  sendVerificationEmail(to: string, token: string): Promise<void>;
}

// Adapter — infrastructure
class SmtpEmailAdapter implements EmailPort {
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    // Network call
  }
}

// Deep module owns logic
class RegisterService {
  constructor(
    private readonly users: UserRepository,
    private readonly email: EmailPort,
  ) {}
}
```

Tests use `FakeEmailAdapter`. Production uses `SmtpEmailAdapter`.

### 4. True external

Third-party service you don't control. **Inject as port, mock in tests.**

```typescript
// Test
const service = new RegisterService(fakeRepo, fakeEmail);

// Prod
const service = new RegisterService(realRepo, realEmail);
```

## Seam Discipline

- **One adapter = hypothetical seam. Two adapters = real seam.** Don't extract interface until you have real + fake. Premature abstraction = indirection.
- **Internal seams vs external seams.** A deep module can have internal seams (test helpers, fake implementations) not exposed to callers. Don't surface internal seams through the external interface.
- **Depth lives inside the module.** Internal composition doesn't make a module shallow — only the external interface matters.

## Testing Strategy: Replace, Don't Layer

### Before deepening

```typescript
// Tests on shallow wrappers — these become waste
test('PgUserRepository.create inserts row', () => { ... });
test('PgUserRepository.create sets status', () => { ... });
```

### After deepening

```typescript
// Tests at the deepened interface — these replace the above
test("register creates user with unverified status", async () => {
  const fakeRepo = new FakeUserRepository();
  const service = new RegisterService(fakeRepo, fakeEmail);

  await service.register({ email, password });

  expect(fakeRepo.users[0].status).toBe("unverified");
});
```

**Delete old tests on shallow wrappers** once tests at the deepened interface exist. They tested implementation, not behavior.

**Tests must survive internal refactors.** If a test breaks when you change internal structure, it was testing past the interface. Rewrite to test through the interface.

## Deepening Workflow

1. Identify shallow call sequences used by ≥2 callers
2. Compose into one method on the owning module
3. Extract interface if ≥2 implementations exist (real + test)
4. Write tests at the composed interface
5. Delete direct tests on the old shallow wrappers
6. Update callers to use the composed method
7. File `design-debt` bead for each pattern fixed
