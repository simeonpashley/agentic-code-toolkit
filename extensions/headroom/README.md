# Headroom — token-compression extension

Forwards conversation context to a local [Headroom](https://github.com/Astroburned/headroom-ai) proxy (`/v1/compress`) and reflects the savings back into the LLM context. Compresses tool-result text above a configurable character threshold.

**Upstream attribution**: forked from an earlier release of the [`@raquezha/noheadroom`](https://www.npmjs.com/package/@raquezha/noheadroom) pi extension (MIT, © 2026 raquezha). The local fork has diverged substantially from the published package and is maintained independently. See the repository's `NOTICE` file for full attribution.

## Install

No extra steps. `pnpm run install:global` from the kit root deploys `extensions/headroom/index.ts` into `~/.pi/agent/extensions/headroom/`. The extension requires the `headroom` binary on `PATH` (or set `PI_HEADROOM_COMMAND`).

## Commands

- `/headroom` — print status
- `/headroom on` — enable for this session, auto-start the proxy if needed
- `/headroom off` — disable for this session (proxy left running)
- `/headroom status` — detailed status including session stats
- `/headroom health` — check /health, restart proxy if not running
- `/headroom stats` — fetch proxy `/stats` JSON
- `/headroom mode <normal|quiet|silent>` — change output mode (persisted to `~/.pi/agent/headroom/settings.json`)
- `/headroom-health` — alias for `/headroom health`

## Env vars

| Variable                         | Default                 | Purpose                             |
| -------------------------------- | ----------------------- | ----------------------------------- |
| `PI_HEADROOM_ENABLED`            | `true`                  | Master switch                       |
| `PI_HEADROOM_URL`                | `http://127.0.0.1:8788` | Proxy base URL                      |
| `PI_HEADROOM_ALLOW_REMOTE`       | `false`                 | Allow non-loopback `baseUrl`        |
| `PI_HEADROOM_AUTO_START`         | `true`                  | Spawn detached proxy if not running |
| `PI_HEADROOM_MODE`               | `normal`                | `normal` / `quiet` / `silent`       |
| `PI_HEADROOM_COMMAND`            | `headroom`              | Binary name on PATH                 |
| `PI_HEADROOM_MIN_CONTEXT_TOKENS` | `20000`                 | Skip below this ctx size            |
| `PI_HEADROOM_MIN_MESSAGE_CHARS`  | `2000`                  | Only candidates ≥ this char count   |
| `PI_HEADROOM_TIMEOUT_MS`         | `30000`                 | `/v1/compress` timeout              |

## Security

- **Remote URLs are blocked by default.** Set `PI_HEADROOM_ALLOW_REMOTE=1` only for a trusted proxy. The proxy auto-spawner refuses non-loopback hosts.
- **Loopback-only proxy spawn.** `proxy-manager.ts::parseLocalEndpoint` rejects non-`http(s)` schemes and non-loopback hosts. Spawned child is detached, `stdio: ignore`, `unref`'d, and inherits no terminal.
- **Telemetry disabled by default.** The spawned proxy child always gets `HEADROOM_TELEMETRY=off` in its environment unless the user has explicitly set `HEADROOM_TELEMETRY` in their shell before invoking Pi.
- **Proxy left running after Pi exits** (upstream design). To stop: `pkill -f "headroom proxy"`.

## Manual proxy smoke

```bash
headroom proxy --host 127.0.0.1 --port 8788 --mode token --no-cache &
curl -sS http://127.0.0.1:8788/health | jq .
```

Expected response: `{"service":"headroom-proxy","status":"healthy",…}`.

## Files

- `index.ts` — runtime, hooks, commands, status, telemetry
- `types.ts` — wire-shape and config types
- `config.ts` — env + settings file parser
- `client.ts` — HeadroomHttpClient
- `proxy-manager.ts` — proxy child-process spawn + endpoint parser
- `compression.ts` — message conversion + compression application
