# Token Hygiene Extension

All features are live by default — warnings, metrics, and `/token-hygiene`.
Bash output compression is not yet implemented.

## Quick Reference

### Enable / Disable Token Hygiene

| Variable / File         | Effect                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `PI_TOKEN_HYGIENE=0`    | Disable token hygiene entirely (no metrics, no warnings).                                              |
| `.pi-token-hygiene-off` | Sentinel file in repo root. When present, token hygiene is disabled entirely. Must be in `.gitignore`. |

### Metrics Controls

| Variable / File                     | Effect                                                   |
| ----------------------------------- | -------------------------------------------------------- |
| `PI_TOKEN_HYGIENE_METRICS=0`        | Disable metrics recording while keeping warnings active. |
| `PI_TOKEN_HYGIENE_METRICS=1`        | Enable metrics recording (enabled by default).           |
| `PI_TOKEN_HYGIENE_WORKLOAD=<label>` | Assign a workload label to metrics data.                 |

### Warnings

Warnings are advisory and never block execution. The following warnings are enabled by default:

| Warning                   | Env / Config                                  | Description                                                                                                                                                            |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact duplicate reads     | `warnDuplicateReads` (default: true)          | Warns when an unchanged file range is read a second time.                                                                                                              |
| Repeated searches         | `warnDuplicateReads` (default: true)          | Warns when the same grep/glob/websearch/webfetch pattern repeats.                                                                                                      |
| Bash file-dump nudges     | `warnToolChoice` (default: true)              | Warns on `cat <file>`, `head <file>`, `tail <file>`, unbounded `find`, and `ls -R`. Does not nudge filtered commands, pipelines, git commands, or mutating operations. |
| Large reads without limit | `warnLargeReads` (default: true)              | Warns on `read` results over 500 lines without an explicit `limit`.                                                                                                    |
| Custom-context visibility | `warnCustomContextVisibility` (default: true) | Warns on custom-context snippets above the visibility threshold.                                                                                                       |

### `/token-hygiene` Command

The `/token-hygiene` slash command displays a context report with bucket sizes, recent warnings, candidate reductions, and data controls. It is always available when token hygiene is enabled.

### Metrics

Metrics are recorded as newline-delimited JSON to `.pi/token-hygiene-metrics.jsonl` in the repo root. All identifiers are HMAC-hashed. The HMAC key lives outside the repo-local `.pi/` directory under the Pi config directory (typically `~/.config/pi/.pi-token-hygiene-hmac-key`).

Metrics are enabled by default. To disable: `export PI_TOKEN_HYGIENE_METRICS=0`.

Redaction is applied to every metric event. The following are never written to metrics:

- Raw prompts, raw tool call payloads, raw file bodies
- Environment variable values, API bodies, full diffs
- Tool schema text, custom-context snippets, raw bash output
- File paths and search keys (HMAC-hashed instead)

### Data Controls and Deletion

Metrics are stored at `.pi/token-hygiene-metrics.jsonl` (configurable via `metricsPath`). Rotation defaults to 10 MB per file, 5 rotated files, 30-day retention.

Disabling token hygiene or metrics does not delete existing metrics; run `pnpm tsx scripts/token-hygiene/analyse-metrics.ts --delete-local-metrics` to remove repo-local token-hygiene data.

To view a summary report:

```bash
pnpm tsx scripts/token-hygiene/analyse-metrics.ts .pi/token-hygiene-metrics.jsonl --markdown
```

Deleting local token-hygiene data removes repo-local metrics and retained-output files, but copies may remain in Time Machine, rsync targets, VM snapshots, or other filesystem backups until those backup systems expire them.

### HMAC Key

The HMAC key is generated automatically at `~/.config/pi/.pi-token-hygiene-hmac-key` (outside the repo-local `.pi/` directory) with 0600 permissions. It is a 32-byte random key used to produce stable, non-reversible identifier hashes for metrics.

Key loss makes previous metrics not directly comparable. The key is never deleted by the `--delete-local-metrics` command.

### Config Reference

All configuration values can be set via extension config (passed to the `TokenHygieneConfig` type) or environment variables. See [types.ts](./types.ts) for the full schema.

Key defaults:

- `enabled`: true
- `metricsEnabled`: true
- `identifierMode`: `"hmac"`
- `warnDuplicateReads`: true
- `warnToolChoice`: true
- `warnLargeReads`: true
- `warnCustomContextVisibility`: true
- `largeReadLineThreshold`: 500
- `modelVisibleMessageThresholdChars`: 500
- `compressBashSuccesses`: false (bash output compression not yet implemented)

## Related Documents

- **[Implementation plan](../docs/plans/2026-07-07-token-hygiene-extension.md)** — full plan with task breakdown and verification steps
- **[Specification](../docs/specs/2026-07-07-token-hygiene-extension-spec.md)** — design spec with scope and guardrails

## Deferred Work

The following are out of scope for this branch and tracked as follow-up work:

- Bash output compression (bash output compression, retained-output safety)
- Deferred analyser processors: `compare`, `redact`, `top-tool-results`, `read-audit`
- Global guidance updates to `agent/AGENTS.md` and `skills/token-efficiency/SKILL.md`
