# 0093 Add Home Simulator flag handling to stack selection

Status: open
Triage: ready-for-agent
Priority: medium
Subsystem: scripts, compose
Spec: [0092](0092-home-simulator-mcp-spec.md)
Depends on: none (0094 builds on it)

## Context

Spec stories 1–7, 11, 23–25. Notes for implementers (read first):
`/home/al/.copilot/session-state/5881740b-0212-4c05-b922-b7cfcc84583d/files/notes/sodalis-seams.md`.

## Acceptance Criteria

- `HOME_PROVIDER=simulator` (the existing simulator flag) also selects the Home
  Simulator path. Flag off: `resolveStack` output, compose and behaviour are
  unchanged.
- New settings, documented in `.env.example`: `HOME_SIMULATOR_ROOT` (absolute
  path of the `home_simulator` checkout), `HOME_SIMULATOR_SCENARIO` (default
  `avatar-support`; consumed by 0094), `HOME_SIMULATOR_BRIDGE_PORT` (default
  `8095`) and `HOME_SIMULATOR_BRIDGE_HOST` (bind address, consumed by 0094;
  never `0.0.0.0`).
- Flag on and `HOME_SIMULATOR_ROOT` missing, blank or not absolute:
  `resolveStack` throws an actionable message naming the setting and where to
  set it (`.env`).
- Flag on, `stack:up` only: a usability check of the checkout (directory exists,
  `.venv/bin/python` — `.venv\Scripts\python.exe` on Windows — and
  `applications/tool_service` exist) fails before anything starts, with a
  message saying what to fix. The filesystem check is injectable/testable and
  must not run for `config`, `pull`, `ps` or `down`.
- The `ai` service receives `HOME_SIMULATOR_BRIDGE_URL`, built as
  `http://host.docker.internal:<port>` (the existing host-helper pattern, see
  `extra_hosts` on `ai`), only when the flag is on; blank otherwise. Add the key
  to `compose.yaml` `ai.environment` as `${VAR:-}`. No new compose service, no
  new profile. `HOME_SIMULATOR_ROOT` itself is not passed to `ai`.
- Flag on: Neo4j (`HOME_GRAPH_*`) and SQLite readings (`HOME_DATA_SQLITE_*`)
  settings stay valid but are ignored: blanked for `ai`, not validated, readings
  file not checked, `compose.companion-data.yaml` not added. Code for both paths
  stays in place.
- Keep CI green: existing `base` stack tests, the `.env.example` test and the CI
  `compose` job (`pnpm stack:config` from `.env.example`) still pass. Update
  fixtures/`.env.example`/the CI step with a placeholder absolute root as
  needed; the placeholder must not need to exist on disk for `stack:config`.
- Behaviour tests (extend `scripts/stack-config.test.ts`, and
  `scripts/companion-compose.test.ts` for the compose rendering): flag enables
  the path; missing/invalid root fails fast with a clear message; env reaches
  `ai`; no new service/profile; flag off changes nothing; Neo4j/SQLite ignored
  when on.
- Gates: `pnpm test`, `pnpm typecheck`, `pnpm build`.
