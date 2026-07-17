---
description: |
  Build sanitized, production-scale local data under production-like settings. Inventory every user-facing feature, role, route, button, input, modal, state, and workflow; define documented acceptance criteria and finite risk-based edge cases for each. Test as a real user, logging every bug with reproduction evidence. Review findings for shared causes and dependencies; implement coherent fixes with regression tests, then rerun the full inventory. Stop at a clean pass or blocked handoff. Ask before production, sensitive data, or destructive actions.
---

**READ DOCS** under `docs/implementation/full-product-evaluation/*` for the latest evaluation. It is possibly incomplete.

Build sanitized, production-scale local data under production-like settings. Inventory every user-facing feature, role, route, button, input, modal, state, and workflow; define documented acceptance criteria and finite risk-based edge cases for each. Test as a real user, logging every bug with reproduction evidence. Review findings for shared causes and dependencies; implement coherent fixes with regression tests, then rerun the full inventory. Stop at a clean pass or blocked handoff. Ask before production, sensitive data, or destructive actions.

Use this for an exhaustive, end-to-end application QA pass when a production-like local environment and complete interactive-surface coverage matter more than a narrow regression or sample of major features.

1. Build a sanitized or synthetic production-scale local dataset, mirror safe production settings, and record unavoidable differences.
2. Inventory every user-facing feature, role, route, control, state, and workflow; define documented acceptance criteria and a finite risk-based edge-case set for each item.
3. Exercise every inventory item as a real user under its normal and defined edge-case conditions, logging each bug immediately with reproducible evidence. Bugs are logged in the project's issue tracker with full reproduction context.
4. Review the complete open set for shared causes, dependencies, and conflicting fixes, then implement the smallest coherent solution with regression coverage.
5. Rerun affected paths and the complete inventory; stop only at a clean full pass or an explicit blocked handoff.

Reference documents to maintain:

- docs/implementation/full-product-evaluation/*
