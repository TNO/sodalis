# 0094 Add the Home Simulator host bridge and session script

Status: open
Triage: ready-for-agent
Priority: medium
Subsystem: scripts
Spec: [0092](0092-home-simulator-mcp-spec.md)
Depends on: 0093

## Context

Spec stories 8–17, 36–38, 41–42; [ADR 0009](../docs/adr/0009-home-simulator-host-bridge.md).
Notes for implementers (read first):
`/home/al/.copilot/session-state/5881740b-0212-4c05-b922-b7cfcc84583d/files/notes/home-simulator-mcp.md`
and `.../sodalis-seams.md` (same directory). Nothing of the Home Simulator is
copied; Sodalis only spawns the checkout's own Python.

## Acceptance Criteria

- A small stdio MCP client wrapper under `scripts/home-simulator/` (reused by
  0095), built on `@earendil-works/pi-mcp` (`StdioTransport`, `McpClient`). Add
  it as a direct devDependency and update `pnpm-lock.yaml` (CI uses a frozen
  lockfile). Spawn `<root>/.venv/bin/python` unresolved with `cwd=<root>`,
  state dir `<root>/output/tool-service`.
- Session script (`pnpm home-simulator:session`, `tsx`; run by the launcher only
  when the flag is on): starts the coordinator role over stdio, reuses a
  registered dataset whose `metadata.plan` equals the scenario
  (`HOME_SIMULATOR_SCENARIO`, default `avatar-support`; pick one
  deterministically when several match), otherwise generates once
  (`generate_dataset`, poll `get_job`, fail clearly on failed/interrupted), then
  opens a fresh replay session on every run (`open_session`). Writes
  session ID and state directory to a handoff file the bridge reads (e.g.
  `logs/home-simulator/session.json`). Closes the coordinator; never exposes it.
- Host bridge (Sodalis-owned process, `tsx` entry): spawns `--role avatar
  --session-id <id> --state-dir <dir>` as a stdio child and serves HTTP, bound
  to `HOME_SIMULATOR_BRIDGE_HOST` on `HOME_SIMULATOR_BRIDGE_PORT`; never binds
  `0.0.0.0`. Default host: the Docker bridge address (`172.17.0.1`) when present
  on a Linux host, otherwise `127.0.0.1`; document why (Linux `host-gateway`).
  No authentication.
- Bridge HTTP contract (also consumed by 0096; keep exact):
  - `GET /health` → `200 {"ok":true}`.
  - `GET /clock` → `200 {"simulationTime":"<ISO from get_session.simulation_time>"}`.
  - `POST /tools/<name>` with `<name>` one of `query_sensor_data`,
    `get_context`, `query_ontology`, `query_weather`, `get_agenda`; JSON body =
    the tool arguments; `200` with the tool's `structuredContent` as the body;
    a tool-level error (`isError`) → `422 {"error":"<message>"}`.
  - Any other tool name (incl. `next_interaction_batch`, `acknowledge_batch`,
    `parse_claims`, `get_session`, every coordinator tool) → `404`; other
    methods/paths → `404`/`405`. The bridge holds no coordinator connection.
  - Child exit → subsequent requests `503 {"error":"unavailable"}` and a stderr
    warning.
- Launcher (`scripts/dev-stack.ts`), flag on only: after compose `up` succeeds,
  run the session script, then start the bridge detached with its pid and port
  recorded under `logs/home-simulator/`; wait for `/health`. `down` (and the
  stop before a fresh `up`) stops the recorded bridge process and is a no-op when
  none exists. Fresh replay session on every `stack:up`. Flag off: nothing
  starts and nothing is touched.
- Behaviour tests against a fake stdio MCP server fixture (small Node script
  under `scripts/home-simulator/fixtures/`, reused by 0095; mimic the shapes in
  the notes): dataset reuse vs generate-once, fresh session per run, handoff
  content, bridge serves only the five tools and 404s everything else (batch,
  ack, claims, session, coordinator tools), `/clock`, tool error → 422, dead
  child → 503, launcher start/stop idempotence (pure/injectable where possible,
  no real docker). No test needs a real checkout.
- Gates: `pnpm test`, `pnpm typecheck`, `pnpm build`. Do not edit `home_simulator`.
