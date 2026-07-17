---
name: opus-code-complexity-review
disable-model-invocation: true
description: "Use on any diff or file under review when complexity, file size, or LOC discipline is in question — files approaching or exceeding the 300 LOC threshold, post-refactor measurements, or any 'file too big' or 'complexity review' request. Enforces LOC limits, flags cyclomatic hotspots, and maintains a register of files requiring effort. Auto-triggers under opus-reviewer when complexity is detected. Distinct from opus-code-quality-reviewer (broader maintainability and structural health, not just size) and opus-codebase-design-reviewer (module interfaces, not file-level metrics). Do not use as the only reviewer on architectural or behavioural changes."
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
          - "complexity"
          - "file size"
          - "LOC"
          - "cyclomatic complexity"
      input_types:
        - "diff"
        - "file"
        - "full-codebase"
      primary_for:
---

Enforce complexity and file-size rules. Keep large files visible, tracked, and under pressure to shrink.

## Adjacent Agent Delegation

When triggered, also invoke:

- `opus-code-quality-reviewer` — for code-quality context on the files under review.

## Rules

- Files > 500 LOC:
  - Must have split plan or explicit exception.
  - If none: log as Major in register.
- Files > 300 LOC:
  - Require seam review.
  - Decompose by responsibility, not line count.
- Existing over-limit files:
  - Are debt. Track in `docs/architecture/file-size-reviews.md`.
  - When editing:
    - Execute part of the split plan, or
    - Update register with justification.
- No:
  - Generic `utils.ts` dumping grounds.
  - Exporting internals only to reduce LOC.
  - Splitting across architecture boundaries just to shrink a file.

## When to use

- Running complexity scan before or after changes
- Touching a file > 300 LOC
- Post-flight for any feature/fix that adds to large files
- During architecture reviews

## Workflow

1. Run tool:
   - `pnpm run complexity-check`
2. Read report:
   - Identify new or worsening offenders.
3. Update register:
   - Add/modify entries in `docs/architecture/file-size-reviews.md`:
     - file
     - lines
     - discovered
     - reason
     - action
     - status (open | in-progress | done | accepted-risk)
4. Decide:
   - If cheap and local: implement fix now.
   - Else:
     - Log in `docs/technical-debt-and-risks.md` if high impact.
     - Ensure register entry has concrete action.

## Review style

- Terse. One line per finding.
- Prefer:
  - "L1-480: 480 LOC. 3 responsibilities. Split auth + policies + logging."
  - "L1-610: 610 LOC. No split plan. Add seam review and split plan."
- No vague "consider refactoring".

## Boundaries

- Read-only on code.
- Writes:
  - `docs/architecture/file-size-reviews.md` (via tool or inline)
- Delegates:
  - Actual split/refactor to /opus-feat or /opus-go with a plan.
