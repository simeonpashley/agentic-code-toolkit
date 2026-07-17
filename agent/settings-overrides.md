# settings-overrides.json schema reference

This file is shipped as **declarative intent** — every value here differs
from pi's runtime default for the same key. The installer (`scripts/install-global.ts`)
loads `settings-overrides.json`, runs `applyOverride()` from
`scripts/settings-merge.ts`, and:

1. **Validates** each known key against `SETTINGS_DEFAULTS` (type +
   enum where applicable).
2. **Strips** any key whose value matches the runtime default — the
   override only writes _deltas_, never re-states defaults.
3. **Deep-merges** the remaining values into `~/.pi/agent/settings.json`,
   leaving all other keys untouched.
4. **Writes only when values actually change** (semantic compare, not
   byte-for-byte, so JSON reformatting doesn't trigger a write).
5. **Reports drift** — keyed by whether the value is non-default or
   inherited from pi's defaults.

## Schema (verified against `@earendil-works/pi-coding-agent` 0.80.2)

Canonical source: `core/settings-manager.d.ts → Settings` interface and
the getter fallbacks in `core/settings-manager.js`. The table below is
maintained by hand against those files. Bump the version when bumping pi.

### Keys shipped in this repo's override file

| Key                             | Type                                                           | Runtime default | Override value | Why                                             |
| ------------------------------- | -------------------------------------------------------------- | --------------- | -------------- | ----------------------------------------------- |
| `collapseChangelog`             | boolean                                                        | `false`         | `true`         | Saves screen real estate                        |
| `enableInstallTelemetry`        | boolean                                                        | `true`          | `false`        | Privacy stance                                  |
| `quietStartup`                  | boolean                                                        | `false`         | `true`         | Faster startup                                  |
| `hideThinkingBlock`             | boolean                                                        | `false`         | `true`         | Cleaner transcript                              |
| `doubleEscapeAction`            | `"fork" \| "tree" \| "none"`                                   | `"tree"`        | `"none"`       | Keep the tree for `/tree` slash command instead |
| `defaultThinkingLevel`          | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` | undefined       | `"high"`       | Daily-driver default                            |
| `terminal.showTerminalProgress` | boolean                                                        | `false`         | `true`         | OSC 9;4 indicator                               |

### Keys supported but currently not shipped

These keys are recognised by the install pipeline (`SETTINGS_DEFAULTS` in
`scripts/settings-merge.ts`) and can be added to the override file if you
want to enforce a non-default. Shipping their default value is a no-op
(the smart-strip removes it as a no-op).

| Key                        | Type    | Runtime default |
| -------------------------- | ------- | --------------- |
| `compaction.enabled`       | boolean | `true`          |
| `branchSummary.skipPrompt` | boolean | `false`         |
| `retry.enabled`            | boolean | `true`          |
| `enableAnalytics`          | boolean | `false`         |
| `enableSkillCommands`      | boolean | `true`          |

### Per-machine / runtime keys (intentionally not in SETTINGS_DEFAULTS)

| Not supported                                                                                                     | Reason                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `theme`                                                                                                           | Per-machine aesthetic preference                        |
| `defaultProvider` / `defaultModel`                                                                                | Per-machine billing / API contract                      |
| `enabledModels`                                                                                                   | Personal allowlist                                      |
| `packages`                                                                                                        | Personal npm dependencies                               |
| `extensions` / `skills` / `prompts` / `themes`                                                                    | Auto-discovered, not a settings key                     |
| `tui.input.newLine`                                                                                               | Handled by `~/.pi/agent/keybindings.json`, not settings |
| `lastChangelogVersion` / `trackingId` / `shellPath` / `shellCommandPrefix` / `npmCommand` / `defaultProjectTrust` | Runtime / per-machine state                             |

## How drift is reported

The install log surfaces two distinct lists:

- **Drift**: live keys whose values differ from pi's default. These
  are real opinions — you (or a prior install) chose differently from
  pi's default. Add to the override to make the repo enforce them.
- **Inherited defaults**: live keys whose values match pi's default.
  These ARE managed (by pi's defaults); we simply don't ship an opinion.
  Adding them to the override as their default value would be a no-op.
