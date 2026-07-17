# Agentic Code Toolkit

A working collection of extensions, skills, scripts, and configuration for
[pi](https://pi.dev/) — the AI coding agent for the terminal.

If you run pi daily and want a curated skill library plus a stack of
guardrails, this is the setup. The skill content and conventions can also
be adapted for [Claude Code](https://claude.com/product/claude-code),
[Codex](https://openai.com/index/introducing-codex/),
[OpenCode](https://opencode.ai/),
[Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli),
and [Gemini CLI](https://github.com/google-gemini/gemini-cli). Installation
paths, tool mappings, and instruction-file conventions differ by runtime.
The TypeScript extensions are pi-only because they import pi's runtime APIs.

The companion reading on pashley.org lives under the
[Applied AI topic](https://pashley.org/topics/applied-ai), which covers
the wider practice of putting AI to work on real engineering problems.

## What the toolkit actually does

- **Token-hygiene metrics exclude raw prompt and tool-payload data.**
  When metrics are enabled, identifiers are HMAC-hashed. Raw prompts,
  environment-variable values, API bodies, file contents, file paths,
  tool schema text, custom-context snippets, and raw bash output are not
  written to the metrics file.
- **Hashline file editing is tested against 19 known failure modes.**
  Stale reads, silent prefix leakage, fuzzy boundary collisions, insert
  hint mistakes, and the rest of the failure surface are pinned by an
  integration test suite.
- **Guardrails intercept configured destructive-command patterns.**
  The supplied extensions check patterns such as `rm -rf`,
  `git push --force`, and live-database mutation commands before they
  execute. They reduce risk; they are not a sandbox and can be bypassed
  by misconfiguration or an uncovered command form.
- **Skills speak in actions, not tool names.** Each `SKILL.md` describes
  work in terms of "dispatch a subagent", "read a file", and "create a
  todo". The reference documents under
  `skills/using-superpowers/references/` map those actions to each
  supported runtime's tools.

## What is in the box

The repo is the source of truth. Installed locations are overwritten on
every `pnpm run install:global`.

| Directory | Contents | Installed to |
| --- | --- | --- |
| `skills/` | Skill definitions in Markdown (50+ skills) | `~/.agents/skills/` |
| `extensions/` | TypeScript extensions for pi (18 directories) | `~/.pi/agent/extensions/` |
| `scripts/` | Installers, settings-merge logic, audit and analysis tools | `~/.pi/agent/scripts/` |
| `agent/` | `AGENTS.md`, `APPEND_SYSTEM.md`, settings overrides, agent definitions | `~/.pi/agent/` |
| `prompts/` | Reusable prompt templates (app security and user evaluation, etc.) | `~/.pi/agent/prompts/` |
| `templates/` | New-repo scaffolding | — |
| `tests/` | Vitest suites for every extension with non-trivial behaviour | — |

The full routing table — edit-here-vs-installed-there, and the partial-merge
contract for `agent/settings-overrides.json` — lives in [`AGENTS.md`](./AGENTS.md).

### What travels between agents

- **`skills/`** is portable at the content level. Every skill is a
  `SKILL.md` with `name` and `description` frontmatter, speaking in
  actions rather than naming one runtime's tools. Installation paths and
  available tools still differ by runtime.
- **The conventions are portable, but the filename is not universal.**
  Codex, OpenCode, and Copilot CLI read `AGENTS.md`. Claude Code uses
  `CLAUDE.md`; Gemini CLI uses `GEMINI.md`. Import or adapt the shared
  instructions rather than assuming every runtime reads `AGENTS.md`.
- **`scripts/`** is mostly portable, with one script that imports pi's
  runtime APIs.

### What is pi-specific

- **`extensions/`** is pi-only. The TypeScript in these directories
  imports from `@earendil-works/pi-coding-agent`, so they only run on pi.
- **`scripts/install-global.ts`** writes pi configuration to
  `~/.pi/agent/` and shared skills to `~/.agents/skills/`. Codex,
  OpenCode, Copilot CLI, and Gemini CLI recognise the shared skills path;
  Claude Code requires its own `~/.claude/skills/` path.
- **`agent/settings-overrides.json`** is pi-specific (the installer
  validates it against pi's `Settings` interface and pins defaults to
  pi-coding-agent 0.80.2).

### Choose the installation path

| Runtime | Skills location | Shared instructions |
| --- | --- | --- |
| pi | Run `pnpm run install:global` | Installed to `~/.pi/agent/` |
| Claude Code | `~/.claude/skills/` | Use `CLAUDE.md`; it can import a project `AGENTS.md` with `@AGENTS.md` |
| Codex | `~/.agents/skills/` or `~/.codex/skills/` | `AGENTS.md` |
| OpenCode | `~/.agents/skills/` or `~/.config/opencode/skills/` | `AGENTS.md` |
| Copilot CLI | `~/.agents/skills/` or `~/.copilot/skills/` | `AGENTS.md` |
| Gemini CLI | `~/.agents/skills/` or `~/.gemini/skills/` | Adapt shared instructions into `GEMINI.md` |

The files under `skills/using-superpowers/references/` are the authority
for the runtime mappings shipped by this repo. OpenCode's current paths
are documented in its [Agent Skills documentation](https://opencode.ai/docs/skills/).

### Extensions (pi only, selected)

- **`token-hygiene`** — advisory warnings on duplicate reads, repeated
  searches, large reads, and bash file-dumps. Records redacted metrics
  with HMAC-hashed identifiers. Add a `.pi-token-hygiene-off` sentinel
  to disable the extension for one repository.
- **`pi-hashline-edit`** — pin-stable file editing using
  `LINE#xHASH│content` anchors, with boundary detection, stale-read
  errors, and integration tests covering 19 known failure modes.
- **`confirm-destructive`** — intercepts destructive tool calls
  (`rm -rf`, `drop`, force-push, etc.) before they run. Confirms via the
  TUI, with stash, symlink, and session-allow tests.
- **`guardrail-protection`** — defence-in-depth extension that
  constrains which tools the agent can call under which conditions.
- **`security`**, **`dangerous-commands`**, **`redact`** — additional
  layers for command auditing, dangerous-command blocking, and
  sensitive-output redaction.
- **`context7`** — fetches version-accurate third-party library docs
  before the agent codes against an external API.
- **`status`**, **`tps`**, **`rtk`** — TUI enhancements: status line,
  tokens-per-second display, runtime kit.
- **`custom-footer`**, **`pricing-hints`**, **`headroom`**,
  **`output-parser`**, **`context-inspector`**, **`extra-tools`** —
  quality-of-life additions.

### Skills (portable, selected)

The full set covers the engineering life-cycle end-to-end:

- **Planning and design** — `brainstorming`, `deliberation`,
  `grill-with-docs`, `domain-modelling`, `writing-plans`,
  `executing-plans`, `finishing-a-development-branch`.
- **Implementation discipline** — `test-driven-development`,
  `systematic-debugging`, `verification-before-completion`,
  `error-recovery`, `token-efficiency`, `caveman`.
- **Review** — `using-superpowers` (meta-routing),
  `requesting-code-review`, `opus-reviewer` (multi-axis orchestration),
  and the full `opus-*` reviewer family (architecture, code quality,
  complexity, refactor, data quality, database, docs, security,
  operational safety, skill description).
- **Maintenance** — `dependency-management`, `data-lifecycle-review`,
  `launch-readiness-review`, `research-to-skills`, `writing-skills`,
  `opus-learn`.
- **Surface reviews** — `founder-operator-review`,
  `neurodivergent-ux-review`, `trust-and-claims-review`,
  `frontend-design`, `improve-codebase-architecture`.

`using-superpowers` is the entry point: it routes every reply to the
skill that fits the task before the agent does any other work.

### Scripts and tooling

- **`scripts/install-global.ts`** — installer that copies this repo's
  contents to `~/.pi/agent/` and `~/.agents/skills/`. Honors the
  partial-merge contract on `agent/settings-overrides.json` (validates
  against the `Settings` interface, strips values that match pi's
  runtime defaults, deep-merges the rest, writes only on real change,
  reports inherited defaults).
- **`scripts/settings-merge.ts`** — the per-key validation and deep-merge
  logic, pinned to `@earendil-works/pi-coding-agent` 0.80.2.
- **`scripts/audit-url.ts`** and
  **`scripts/token-hygiene/analyse-metrics.ts`** — utility entrypoints
  for URL and token-hygiene audits.
- **`scripts/reviewer-dispatch-*.ts`** — orchestrates code-review
  subagents with curated context.

### Tests

Every extension with non-trivial behaviour has a Vitest suite under
`tests/`. At the time of writing, that is 50+ test files covering
hashline editing (19 cases), confirm-destructive, guardrail-protection,
token-hygiene, pricing-hints, headroom, settings-merge, skill
frontmatter, and website-ux audit. Run with `pnpm test`.

## Install

```bash
git clone https://github.com/simeonpashley/agentic-code-toolkit.git
cd agentic-code-toolkit
pnpm install
pnpm run install:global
```

The installer overwrites `~/.pi/agent/` and `~/.agents/skills/`. To
uninstall, remove those directories — there is no background service or
daemon. To customise behaviour, edit this repo and re-run
`pnpm run install:global`; never edit the installed locations directly,
as your changes will be clobbered on the next install.

For a non-pi agent, use the runtime-specific paths in
[Choose the installation path](#choose-the-installation-path). Copy or
symlink only the `skills/` directory, then import or adapt the shared
instructions using that runtime's conventions file. Skip
`pnpm run install:global`; it also writes pi-specific configuration.

This repo pins pi-coding-agent to 0.80.2 for type-enum validation of
the settings override file. If you upgrade pi past a release that
changes `core/settings-manager.d.ts` or its getter fallbacks, bump the
`SETTINGS_DEFAULTS` table in `scripts/settings-merge.ts` before
re-running the installer.

## Configuration

All configurable behaviour for the pi-specific layers lives in
`agent/settings-overrides.json`. The installer only ships values that
differ from pi's runtime defaults, so the override file expresses
enforced intent rather than restating defaults. See
[`agent/settings-overrides.md`](./agent/settings-overrides.md) for the
per-key schema and rationale.

To disable a behaviour locally without editing this repo:

| Variable | Effect |
| --- | --- |
| `PI_TOKEN_HYGIENE=0` | Disable token-hygiene extension entirely. |
| `PI_TOKEN_HYGIENE_METRICS=0` | Keep warnings; stop recording metrics. |
| `PI_TOKEN_HYGIENE_WORKLOAD=<label>` | Tag recorded metrics with a workload label. |

A `.pi-token-hygiene-off` sentinel file in a repo root disables
token-hygiene for that repo only.

## Disclaimers — read before using

This is software written for my own use. I am sharing it because it
might save you some work. The following conditions apply:

- **No warranty.** The toolkit is provided "as is", without warranty
  of any kind, express or implied, including but not limited to the
  warranties of merchantability, fitness for a particular purpose, and
  non-infringement.
- **No comebacks.** I am not offering support, consulting, bug fixes,
  or feature requests in connection with this repository. Issues may
  be raised for transparency, but there is no commitment to respond or
  to act.
- **Your mileage will vary.** Extensions and skills are tuned for the
  way I work, on macOS, on the projects I happen to be building. They
  may not fit your stack, your team, or your threat model. Read the
  code before enabling anything that touches destructive operations,
  file deletion, network access, or secret material.
- **At your own risk.** Anything that runs an irreversible action —
  `rm -rf`, `git push --force`, `drizzle-kit push` against a live
  database, anything in `**/KNOWN-IRREVERSIBLE/**` — is gated by
  `confirm-destructive` and `guardrail-protection`, but those gates are
  software too and can be bypassed by misconfiguration. You are
  responsible for verifying the gate caught what you intended before
  you confirm.
- **No endorsement of model output.** AI-assisted code suggestions are
  produced by a model that can be wrong. Treat generated diffs the same
  way you would treat a pull request from a contractor you have never
  met: review it, test it, and own it.

In plain English: this is a public notebook of tools that work for me.
Use what is useful, ignore the rest, do not run it on anything you
cannot afford to lose.

## Project status

Active. I run this configuration daily against production repositories,
so breaking changes get noticed quickly. The repo follows the
bead-based workflow described in `AGENTS.md`, and the issue tracker is
the source of truth for in-flight work.

## Where to read more

- [Applied AI on pashley.org](https://pashley.org/topics/applied-ai) —
  the wider practice of putting AI to work on real engineering
  problems.
- [`AGENTS.md`](./AGENTS.md) — file-routing table, settings-merge
  contract, and non-interactive shell command rules for agents working
  in this repo.
- [`agent/AGENTS.md`](./agent/AGENTS.md) — the global agent
  instructions that ship with the install.
- [pi at pi.dev](https://pi.dev/) — the underlying agent this toolkit
  primarily extends.
- [Claude Code skills docs](https://code.claude.com/docs/en/skills) and
  [OpenCode skills docs](https://opencode.ai/docs/skills/) — the
  per-platform references for the agent-agnostic skills layer.

### I also recommend

This repository does not vendor these packages wholesale. It includes
locally maintained forks or rewrites of selected parts, recorded in
[`NOTICE`](./NOTICE). I also recommend the original MIT-licensed
packages in their own right:

- [mattpocock/skills](https://github.com/mattpocock/skills) — engineering
  and productivity skills. The canonical source for the patterns that
  shaped `skills/grill-with-docs` and
  `skills/improve-codebase-architecture` in this repo.
- [spences10/my-pi](https://github.com/spences10/my-pi) — a curated pi
  distribution and the starting point for several extensions in this
  repo (`redact`, `confirm-destructive`).
- [tomsej/pi-ext](https://github.com/tomsej/pi-ext) — extensions,
  skills, and themes for pi. Starting point for
  `extensions/custom-footer`.
- [sherif-fanous/pi-rtk](https://github.com/sherif-fanous/pi-rtk) —
  routes bash commands through `rtk` for token savings. Starting point
  for `extensions/rtk`.
- [@raquezha/noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom)
  — a Headroom compression bridge for pi. Starting point for
  `extensions/headroom`.

## Licence

MIT. See [`LICENSE`](./LICENSE). Several extensions and skills derive
from the upstream packages listed under [I also recommend](#i-also-recommend);
their copyright holders and licence terms are recorded in
[`NOTICE`](./NOTICE) for attribution.