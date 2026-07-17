---

description: |
Perform an exhaustive, end-to-end application security evaluation in a production-like local environment using sanitised or synthetic data. Inventory every user-facing feature, role, route, control, input, API surface, state transition, permission boundary and workflow. Define documented security acceptance criteria and finite risk-based abuse cases for each. Test as real users and adversarial users across privilege levels. Confirm vulnerabilities through reachable source-to-sink evidence and reproducible behaviour before logging them. Log every confirmed vulnerability in the project's issue tracker with full reproduction evidence. Review findings for shared root causes and dependency chains. Implement coherent fixes with regression and security tests, then rerun the full security inventory. Stop at a clean pass or blocked handoff. Ask before production access, sensitive data access, credential use, destructive actions or external scanning.
---

---

# Exhaustive application security evaluation

**READ DOCS** under `docs/implementation/app-security-evaluation/*` for the latest security evaluation. It may be incomplete.

Perform an exhaustive, end-to-end application security evaluation in a production-like local environment using sanitised or synthetic data.

The target stack is SQL, PostgreSQL, Node.js, TypeScript and React. Focus language-specific scanning on those technologies. Do not perform Rust, Python or Go-specific checks unless those languages are actually present in the repository and are part of the application runtime.

Use this prompt when production-like local conditions, complete interactive-surface coverage, confirmed vulnerability evidence, verified remediation and regression coverage matter more than a narrow sampled audit.

## 1. Safety and access boundaries

Do not use real credentials, production secrets, live customer data, destructive actions, production access, sensitive data access or external scanning without explicit approval.

If any required step needs approval, stop that step and document a blocked handoff with:

- required access or approval
- unresolved risks
- missing evidence
- affected surfaces
- exact next actions

Continue with safe local and synthetic alternatives where possible.

## 2. Initial setup and repository orientation

First inspect the repository structure and determine:

- application framework, for example Express, Fastify, NestJS, Next.js, React, Vite or a custom Node server
- database access layer, for example pg, Prisma, Knex, Drizzle, Sequelize, TypeORM, raw SQL, stored procedures or migration scripts
- route and API entry points
- authentication and authorisation model
- user roles and privilege boundaries
- tenancy, organisation, store, account, region or ownership boundaries
- external service boundaries
- file system boundaries
- client-to-server data flow
- server-to-database data flow
- background jobs, scheduled tasks, webhooks and integration flows
- logging, audit and error handling behaviour
- local test, typecheck, lint and build commands

Before creating issues, inspect the project's issue tracker syntax and supported fields.

If needed, inspect the create or add subcommand help. Use the repository's installed issue tracker syntax. Every confirmed issue must be created with `issue_type="bug"`.

## 3. Production-like local environment

Build or verify a sanitised or synthetic production-scale local dataset.

Mirror safe production settings where possible, including:

- feature flags
- auth and session settings
- role configuration
- tenant or organisation structure
- realistic object ownership
- realistic order, customer, product, account, user, file and integration data
- realistic error and logging configuration
- realistic cache behaviour
- realistic rate-limit settings where locally testable

Record unavoidable differences from production in `docs/implementation/app-security-evaluation/*`.

Do not import real customer data or secrets.

## 4. Complete security surface inventory

Inventory every application security surface, including:

- user roles, permission tiers, tenancy boundaries and account states
- anonymous, authenticated, disabled, locked, invited, expired and partially onboarded states where supported
- routes, pages, forms, modals, buttons, links, hidden controls and state transitions
- APIs, server actions, RPC handlers, background jobs, scheduled jobs, webhooks and queues
- uploads, downloads, exports, imports, reports, notifications and integrations
- authentication, session handling, authorisation, audit logging, rate limits, error states and recovery flows
- data creation, viewing, editing, deletion, sharing, search, filtering and bulk operations
- admin, staff, customer, tenant, organisation, store, account and regional boundaries where applicable
- client-side rendering of user, CMS, product, review, search or admin-configured content
- database reads, writes, migrations, stored procedures and raw SQL execution
- filesystem reads and writes
- outbound HTTP requests
- security headers, CORS, cookies, CSRF and transport assumptions

Maintain or update reference documents under:

```text
docs/implementation/app-security-evaluation/*
```

## 5. Acceptance criteria and abuse cases

For each inventory item, define documented security acceptance criteria and a finite risk-based abuse-case set.

Cover at minimum:

- broken access control and insecure direct object references
- privilege escalation across roles, tenants, ownership boundaries and account states
- authentication bypass
- weak session invalidation
- insecure remember-me behaviour
- password reset abuse
- CSRF
- XSS
- HTML injection
- unsafe redirects
- clickjacking
- client-side trust assumptions
- SQL injection
- unsafe PostgreSQL query construction
- NoSQL injection if relevant
- command injection if relevant to the Node.js application
- template injection
- path traversal
- unsafe deserialisation where present
- SSRF
- unsafe file upload
- unsafe file download
- content-type confusion
- rate-limit bypass
- enumeration
- brute force
- replay
- race conditions
- business-logic abuse
- secrets exposure
- sensitive data leakage
- insecure logs
- verbose errors
- cache leakage
- insecure dependency use
- unsafe configuration
- missing security headers
- insecure transport assumptions

## 6. Confirmation standard

Only log a vulnerability when all of the following are true:

1. There is a clear source of attacker-controlled or lower-trust input.
2. There is a clear dangerous sink or broken security control.
3. The code path is reachable through a feature, route, API, scheduled job, admin function, migration, webhook, import, upload, export or client interaction.
4. Existing validation, escaping, parameterisation, sanitisation, authorisation, authentication, CSRF protection, rate limiting or allowlisting does not sufficiently mitigate the issue.
5. There is concrete evidence from code, tests, logs, HTTP requests, database behaviour, browser behaviour or runtime output.
6. Exact reproduction steps can be described.
7. The impact and exploitability can be explained for a realistic attacker role.

If a finding is plausible but not confirmed, record it in the evaluation notes only. Do not create an issue for it.

Do not create issues for speculative findings, low-confidence regex hits, test fixtures, mock data, examples, documentation snippets, intentionally fake values, unreachable dead code or placeholder secrets.

## 7. Test roles and adversarial perspectives

Exercise every inventory item under normal and abuse-case conditions.

Test as:

- anonymous users
- authenticated users at each role level
- disabled users where supported
- locked users where supported
- invited users where supported
- expired users where supported
- partially onboarded users where supported
- users from different tenants, organisations, stores, accounts, regions or ownership scopes
- admin or staff users where supported
- users with stale sessions, changed permissions or revoked access where supported

For each permission boundary, verify both:

- the intended allowed path
- the denied abuse path

## 8. Security pattern catalogue for focused scanning

Use semantic and textual search to identify candidate sinks, then confirm reachability and exploitability before logging.

### Hardcoded secrets

Look for hardcoded production-like credentials, tokens and private material:

- API keys
- API secrets
- bearer tokens
- JWT signing secrets
- access tokens
- secret keys
- private keys
- AWS access key IDs such as `AKIA...` or `ASIA...`
- database connection strings with credentials
- webhook signing secrets
- OAuth client secrets

Search for patterns such as:

- `api_key`, `api-key`, `apikey`, `api_secret`, `api-secret`
- `token`, `bearer`, `jwt`, `auth_token`, `access_token`, `secret_key`
- `-----BEGIN PRIVATE KEY-----`
- `-----BEGIN RSA PRIVATE KEY-----`
- `-----BEGIN EC PRIVATE KEY-----`
- `AKIA[A-Z0-9]{16}`
- `ASIA[A-Z0-9]{16}`

Ignore obvious placeholders, examples, test fixtures, dummy values, fake values, samples and redacted values.

Confirm whether the secret appears real, reachable, committed to source and used by runtime code.

Do not include real secrets in issues. Redact sensitive values while preserving enough structure to prove the issue.

### SQL injection and unsafe PostgreSQL query construction

Look for unsafe query construction in:

- `query(...)`
- `exec(...)`
- `execute(...)`
- `raw(...)`
- `sql.raw(...)`
- `prisma.$queryRawUnsafe(...)`
- Knex raw queries
- Sequelize raw queries
- TypeORM raw queries
- `pg` client or pool calls
- SQL migration scripts
- PostgreSQL functions and stored procedures
- dynamic report, export, search and admin queries

Pay close attention to dynamic:

- `WHERE` clauses
- `ORDER BY`
- `LIMIT` and `OFFSET`
- table names
- column names
- joins
- search filters
- admin reports
- exports
- imports
- bulk operations
- webhook handlers
- background jobs using user-supplied data

Candidate patterns include:

- SQL template literals containing `${...}`
- SQL strings built through concatenation with request, query, body, params, cookie, header, webhook, file or database-derived values
- raw SQL APIs receiving interpolated strings
- dynamic identifiers without strict allowlists
- `prisma.$queryRawUnsafe`
- `knex.raw` with interpolated SQL text
- `sequelize.query` with interpolated SQL text

Safe parameterised queries are not vulnerabilities. Dynamic identifiers can still be vulnerable unless selected from a strict allowlist.

Only log confirmed cases where user-controlled or lower-trust input reaches SQL text without safe parameterisation or strict allowlisting.

### Authentication, authorisation and IDOR

Inspect route handlers, API controllers, server actions, middleware and database queries for:

- missing authentication
- missing role checks
- tenant boundary bypass
- customer account boundary bypass
- insecure direct object references
- admin-only actions exposed to normal users
- user ID, account ID, order ID, basket ID, address ID, payment method ID or tenant ID accepted without ownership checks
- server trust in client-supplied role, user ID, tenant ID, account ID, organisation ID or permission fields
- permission checks performed only in the client
- middleware ordering mistakes
- stale permission or session state
- bulk operations missing per-object authorisation

Confirm with source-to-sink analysis and reproduction steps.

### Unsafe JavaScript or TypeScript execution

Look for:

- `eval(...)`
- `new Function(...)`
- string arguments to `setTimeout` or `setInterval`
- dynamic imports using attacker-controlled paths
- unsafe template execution
- server-side rendering of attacker-controlled templates
- unsafe use of Node `vm`

Confirm whether attacker-controlled data can influence executable code.

### React and DOM XSS

Look for:

- `dangerouslySetInnerHTML`
- `.innerHTML =`
- `.outerHTML =`
- `insertAdjacentHTML`
- unsanitised markdown rendering
- unsanitised CMS or rich text rendering
- unsafe URL injection into links, redirects or iframes
- client-side rendering of server-provided HTML
- React components that render user profile fields, product descriptions, reviews, search terms, CMS content or admin-configured content as HTML

Confirm the source of the rendered content and whether sanitisation is present, correct and applied before rendering.

Do not flag `dangerouslySetInnerHTML` if the input is demonstrably constant, fully sanitised with an appropriate allowlist or only used in trusted static content.

### Weak cryptography and insecure randomness

Look for:

- MD5 used for security-sensitive hashing
- SHA-1 used for security-sensitive hashing
- `Math.random()` used for tokens, session IDs, password reset codes, invite codes, OTPs, nonces, salts, API keys or other security decisions
- hardcoded cryptographic keys
- weak JWT signing secrets
- missing JWT verification options where relevant
- insecure password hashing choices
- custom cryptography

Do not flag MD5 or SHA-1 used only for non-security checksums unless there is a realistic integrity, authentication or collision impact.

Do not flag `Math.random()` used only for UI animation, colours, jitter, shuffling, tests or non-security presentation logic.

### Path traversal and unsafe file access

Look for dynamic input reaching:

- `readFile`
- `readFileSync`
- `createReadStream`
- `writeFile`
- `writeFileSync`
- `open`
- upload paths
- download paths
- export paths
- import paths
- static file serving
- archive extraction
- report generation

Confirm whether user-controlled path segments can escape an intended directory or overwrite or read unintended files.

Check whether the code uses safe path normalisation, base directory enforcement and allowlisted filenames or IDs.

### SSRF

Look for user-controlled or lower-trust input reaching:

- `fetch(...)`
- `axios(...)`
- `axios.get(...)`
- `http.get(...)`
- `https.get(...)`
- webhook callbacks
- URL preview features
- import-from-URL features
- image proxying
- PDF generation from URL
- server-side metadata fetching
- integrations configured by users or admins

Confirm whether an attacker can cause the server to request arbitrary internal, cloud metadata, localhost or private network URLs.

Do not flag fixed base URLs from configuration unless user input can control the host, protocol or sensitive path.

### CSRF, CORS, cookies and sessions

Review state-changing APIs for:

- missing CSRF protection where cookie-based auth is used
- overly broad CORS with credentials
- insecure cookie attributes
- session fixation risks
- logout endpoints missing appropriate protections
- account change endpoints missing appropriate protections
- password, email, MFA or payment method changes missing re-authentication where required
- missing session invalidation after password, email, role or MFA changes

Only log confirmed exploitable cases.

### File upload, download and content handling

Review:

- MIME type validation
- file extension validation
- magic-byte validation
- upload size limits
- storage paths
- public accessibility
- malware-like payload handling
- HTML, SVG, PDF and image uploads
- content disposition
- content type
- filename handling
- archive extraction
- download authorisation

Confirm whether attacker-controlled content can execute, be served unsafely, overwrite files, leak data or bypass authorisation.

### Error handling, logging and data leakage

Review:

- verbose error responses
- stack traces
- SQL errors
- authentication errors
- reset tokens in logs
- passwords or secrets in logs
- PII in logs
- cacheable private responses
- sensitive data returned to lower-privilege roles
- over-broad API responses
- GraphQL or REST fields lacking field-level authorisation where relevant

Only log confirmed sensitive exposure.

### Dependency, configuration and header issues

Review:

- unsafe dependency usage
- known vulnerable packages where locally detectable
- insecure default configuration
- missing or weak security headers
- unsafe CSP
- clickjacking exposure
- insecure transport assumptions
- development-only controls enabled in production-like config

Confirm impact in the application context before logging.

## 9. Scanning and testing approach

Use this sequence:

1. Read existing docs under `docs/implementation/app-security-evaluation/*`.
2. Inventory routes, APIs, server actions, middleware, roles and database access modules.
3. Inventory React components that render user, CMS, product, review, search or admin-configured content.
4. Inventory uploads, downloads, imports, exports, integrations, webhooks and background jobs.
5. Define acceptance criteria and finite abuse cases for each inventory item.
6. Search for dangerous sinks using semantic and textual search.
7. For each candidate, trace input sources backward.
8. Check existing validation, sanitisation, parameterisation, encoding, authentication, authorisation, CSRF protection, rate limiting and allowlisting.
9. Reproduce confirmed issues using tests, curl, browser interaction, local runtime evidence or code-level proof.
10. Log only confirmed vulnerabilities to the issue tracker.
11. Review all open issues for shared root causes.
12. Implement the smallest coherent remediation set.
13. Add regression coverage for every fixed vulnerability.
14. Rerun affected paths.
15. Rerun the complete security inventory.
16. Update docs with results, limitations and remaining risks.

Use repository-native commands where available:

- install commands
- local environment commands
- database migration and seed commands
- typecheck
- lint
- unit tests
- integration tests
- API tests
- end-to-end tests
- database tests
- build commands

Do not make unrelated code changes.

If temporary proof files are created, clean them up unless they are intentionally converted into regression tests.

## 10. Evidence collection

For every confirmed issue, collect evidence before creating the issue.

Evidence can include:

- exact file paths and line numbers
- relevant code snippets
- HTTP request details
- HTTP response details
- curl commands
- browser steps
- screenshots if the environment supports them
- test output
- log output
- database query output
- route definitions
- middleware ordering
- role or permission checks
- data-flow notes from source to sink

Redact real secrets, credentials and sensitive data while preserving enough structure to prove the issue.

## 11. Issue tracker logging requirements

Log every confirmed vulnerability in the project's issue tracker as a bug with the agreed severity, evidence, and reproduction steps.

Each issue must include:

- affected feature, route, API, role and data boundary
- exact reproduction steps
- expected secure behaviour
- actual observed behaviour
- impact and exploitability assessment
- evidence such as request details, response details, screenshots, logs or test output
- suspected root cause
- recommended remediation
- regression test requirement

Use a concise, specific title format:

```text
Security: <vulnerability class> in <feature or route>
```

Example:

```text
Security: SQL injection in admin order export API
```

Each issue body must use this structure:

```md
## Affected area

Feature:
Route or API:
Role:
Data boundary:
Files:
Lines:

## Vulnerability

Pattern:
Severity:
Confidence:
CWE, if clear:

## Exact reproduction steps

1.
2.
3.

## Expected secure behaviour

Describe the secure behaviour that should occur.

## Actual observed behaviour

Describe the observed vulnerable behaviour.

## Impact and exploitability

Impact:
Exploitability:
Prerequisites:
Affected users or data:
Likely attacker role:

## Evidence

Include request details, response details, code references, logs, screenshots, database output or test output.

Redact real secrets.

## Suspected root cause

Describe the underlying implementation flaw.

## Recommended remediation

Describe the required code or design change.

## Regression test requirement

Describe the exact regression test that must be added, including test level:

- unit
- integration
- API
- E2E
- database
```

For each confirmed vulnerability:

1. Prepare the issue body in a temporary file or shell-safe multiline input.
2. Create the issue using the documented project syntax.
3. Set `issue_type="bug"`.
4. Include severity or priority if the local schema supports it.
5. Capture the issue ID.
6. Continue scanning until all relevant codebase areas have been reviewed.

If the issue tracker command fails, inspect the error, correct the command syntax and retry. Do not skip confirmed findings because of an initial CLI syntax error.

## 12. False positive controls

Do not log issues for:

- test fixtures
- mocks
- seed data
- examples
- documentation-only snippets
- placeholder secrets
- fake keys
- obvious redactions
- unreachable dead code
- static content with no attacker control
- parameterised SQL with safe bound values
- dynamic SQL identifiers selected from a strict allowlist
- `Math.random()` used only for UI animation, colours, jitter, shuffling or tests
- MD5 or SHA-1 used only as a non-security checksum
- React HTML rendering where input is constant or correctly sanitised
- fixed outbound URLs from trusted configuration
- intentionally public resources
- expected unauthenticated routes such as login, registration or public product pages, unless an abuse case is confirmed

When uncertain, trace the data flow and search for calling code before deciding. If still uncertain, document it as a candidate in the evaluation notes, not as an issue.

## 13. Root-cause review before remediation

After logging confirmed findings, review the complete open set using:

```sh
# list open issues using the project's tracker CLI
```

Group findings by:

- shared security control failure
- affected permission model
- affected data boundary
- input handling pattern
- output encoding pattern
- query construction pattern
- dependency
- configuration
- architectural defect
- middleware ordering
- missing central guard
- missing schema validation
- missing regression test class

Identify fix ordering, dependencies and conflicts before changing code.

## 14. Remediation rules

Implement the smallest coherent remediation set that addresses root causes rather than isolated symptoms.

Prefer centralised fixes for shared security controls such as:

- authorisation guards
- tenant scoping
- ownership checks
- schema validation
- output encoding
- HTML sanitisation
- SQL parameterisation
- dynamic identifier allowlisting
- CSRF protection
- session policy
- upload validation
- file path normalisation and base directory enforcement
- SSRF URL allowlisting and private network blocking
- secure cookie configuration
- error handling
- logging redaction
- rate limiting

Do not weaken existing controls to pass tests.

Do not suppress errors or hide failures without fixing the vulnerable behaviour.

Do not introduce broad allowlists, bypass flags or role exceptions unless they are explicitly justified and tested.

## 15. Regression coverage

Add regression coverage for every fixed vulnerability.

Include the most appropriate level:

- unit
- integration
- API
- E2E
- database

Tests must prove both:

- the intended allowed path
- the denied abuse path

For each fixed issue, ensure there is a regression test that would fail on the vulnerable implementation and pass on the fixed implementation.

## 16. Rerun and closure

Rerun all affected paths, then rerun the complete security inventory.

Reopen or update issues for:

- failed regressions
- incomplete fixes
- newly discovered related issues
- changed exploitability
- residual risk
- blocked verification

Stop only when one of the following is true:

1. Every inventory item has passed its documented security acceptance criteria and abuse cases.
2. A blocked handoff is documented with unresolved risks, missing access, environmental gaps, required approvals and exact next actions.

## 17. Final response

At the end, report:

- number of confirmed vulnerabilities logged
- issue IDs and titles
- areas scanned
- areas not scanned and why
- commands run
- tests run
- fixes implemented
- regression coverage added
- docs updated
- remaining blocked items, if any
- notable high-confidence candidates investigated but not logged, with the reason they were rejected

Do not include raw real secrets in the final response.
