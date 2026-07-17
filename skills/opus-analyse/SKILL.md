---
name: opus-analyse
description: "Use when a whole-codebase or large-area audit is needed for legacy methods, duplication, scattered logic, dead code, misconfiguration, overengineering, or latent security holes. Walks src/, app/, scripts/, lib/, public APIs, and CLI entrypoints against the project's AGENTS.md and docs/way/* rules; produces a prioritised findings report without editing files. Distinct from opus-reviewer (orchestrates specialist sub-reviewers on a specific diff) and opus-code-refactor (restructures code rather than reporting on it). Do not use as a substitute for systematic-debugging on a specific bug or for finishing-a-development-branch cleanup."
---

**Pre-Flight:** Workflow Sanity Gates (`AGENTS.md` → "Workflow Sanity Gates"; detail at `~/.pi/agent/docs/sanity-gates.md`) — findings that affect dependencies, schema, auth/authz, or security surface are trigger points. Tag each such finding with the gates' fields so downstream consumers (opus-reviewer, opus-claim) can act on them with full evidence.

Steps:

1. Read AGENTS.md, MEMORY.md
2. Read docs/way/ files relevant to the areas you are auditing (architecture, security, data, testing, TS)
3. Walk the project:
   - src/
   - app/
   - scripts/
   - lib/
   - Any public API or CLI entrypoints
4. Identify:
   - Dead code / unreachable functions
   - Duplicate logic across modules
   - Legacy or commented-out code
   - Overengineered abstractions (layers not used, wrappers that do nothing)
   - Misconfiguration (tsconfig, vitest, eslint, env, scripts)
   - Confusing naming or split responsibilities
   - Security risks:
     - Exposed secrets / PATs
     - Insecure defaults
     - Unprotected admin or internal endpoints
5. Cross-check:
   - ADO read-only rule
   - No direct ADO writes
   - LLM rules (no leaking sensitive data into prompts)
   - Test coverage for critical paths

Output:

- Group findings by area (e.g., “Dead code”, “Duplication”, “Security”, “Misconfiguration”)
- For each:
  - File + line
  - Short description
  - Recommended fix
- End with a prioritized plan (P0 / P1 / P2)

Constraints:

- Do not guess. Use actual file content.
- If intent unclear: stop and ask.
