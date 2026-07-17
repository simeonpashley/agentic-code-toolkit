# Contributing

This repository is a working personal configuration that I share because
it might save you some work. It is not a community project.

## Before opening anything

- Read the [Disclaimers section in README.md](./README.md#disclaimers--read-before-using).
  The toolkit is provided as-is. There is no support, no bug-fix
  commitment, and no feature-request process.
- Read [AGENTS.md](./AGENTS.md). It defines the rules every change in
  this repo must obey: file routing, non-interactive shell commands,
  and the partial-merge contract for `agent/settings-overrides.json`.

## Workflow

Issue tracking and task management run through [bd (beads)](https://github.com/gastownhall/beads).
The `.beads/` directory is the source of truth; `.beads/issues.jsonl`
is a passive export. Run `bd prime` for the full command reference.

## Opening an issue

If you have a concrete problem, use the bug report template. Open it
only after reading the disclaimers. Do not open an issue to ask for
support; that is not part of the offer.

## Sending a pull request

Pull requests are welcome but not solicited. There is no SLA. If you
open one:

- Make the change in this repo, not in the installed locations under
  `~/.pi/agent/` or `~/.agents/skills/`. The installer overwrites those.
- Keep commits small and atomic.
- Run `pnpm run verify` (typecheck, lint, format, tests) before
  requesting review.
- Cite the bead that the change closes, or describe the problem
  precisely.

## Attribution

This repository includes local forks and rewrites of upstream MIT-licensed
work. See [NOTICE](./NOTICE) for the full attribution record. If your
contribution touches an upstream-derived file, preserve the existing
attribution comment.