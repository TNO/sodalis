# 0096 Add the Home Simulator assistant tools and simulated now

Status: open
Triage: ready-for-agent
Priority: medium
Subsystem: server
Spec: [0092](0092-home-simulator-mcp-spec.md)
Depends on: none (consumes the bridge contract from 0094 and the `HOME_SIMULATOR_BRIDGE_URL` setting from 0093 through a fake endpoint; can run in parallel)

## Context

Spec stories 26–39, 44. Notes for implementers:
`/home/al/.copilot/session-state/5881740b-0212-4c05-b922-b7cfcc84583d/files/notes/sodalis-seams.md`
(harness section) and `.../home-simulator-mcp.md` (tool shapes). The bridge HTTP
contract is defined in [0094](0094-home-simulator-host-bridge-and-session.md);
this task only needs a fake HTTP endpoint (`node:http` or an injected `fetch`).
[ADR 0007](../docs/adr/0007-companion-harness.md) still governs the harness.

## Acceptance Criteria

- Harness settings gain optional `HOME_SIMULATOR_BRIDGE_URL`. When set (and the
  harness is enabled) the companion is offered exactly five read-only tools,
  separate from the graph tools: sensor data query, context, ontology query,
  weather, agenda (map onto `query_sensor_data`, `get_context`, `query_ontology`,
  `query_weather`, `get_agenda` via `POST /tools/<name>`). The graph tools and
  the SQLite reading tool are not offered then; Neo4j/SQLite settings are
  ignored (no validation failure). Unset: behaviour exactly as today. Harness
  off: nothing exists. `read_external_data`/email tools keep their current
  gating.
- Nothing else is reachable: the server only ever calls the five bridge tool
  paths plus `GET /clock`; no tool or argument can select another path.
- Curated, typed (typebox) parameters with bounded limits (smaller than the
  simulator's own caps), existing timeout/`maxRepeatedCalls`/budget machinery,
  bounded result size (truncate rows/text with a `truncated` marker) so one
  question cannot flood the model. `query_sensor_data` exposes filter params and
  explains in its description that results are oldest first from dataset start
  and that `start` (tz-aware ISO) should be near the simulated now for
  "latest/recent". `query_ontology` is read-only SELECT/ASK (bridge/simulator
  enforce it; surface errors as `invalid_arguments`).
- Existing outcome vocabulary: `ok`/`no_data`/`not_found`/`invalid_arguments`/
  `unavailable`. A refused connection, timeout, 503 or malformed reply →
  `{"status":"unavailable", ...}` that the model can state plainly, plus a
  server `console.warn` (rate-limited). 422 → `invalid_arguments` with the
  simulator's message.
- Simulated now: for each workflow the server reads `GET /clock` and appends one
  line to the system prompt (pi `appendSystemPrompt` through
  `CompanionSessionOptions`/`explicitResources`, not by changing the static
  `COMPANION_SYSTEM_PROMPT` text): the simulated "now", the Europe/Amsterdam
  local time, and that freshness ("latest", "stale") is judged against it, not
  against today's date. Clock unavailable → say the Home Simulator is
  unavailable, don't invent a time. Wall-clock time is never used for Home
  Simulator results. The prompt/guidance also tells the model the replay is
  read-only and dialogue cannot change the simulated home; the existing
  refusal to execute Home actions without confirmation stays unchanged.
- No observation later than the replay clock is requested by the server: when
  `end` is supplied or defaulted it is clamped to the clock; the simulator's
  own "cannot exceed clock" error is surfaced as `invalid_arguments`.
- Behaviour tests in the style of `tools.test.ts`, `emailTool.test.ts`,
  `config.test.ts` and `workflow.test.ts` against a fake bridge: five tools and
  only five (exact name list), shape/bounds of each result, simulated now in the
  system prompt via the audit's `effectiveSystemPrompt`, unavailable state, 422
  mapping, graph/SQLite tools absent when the URL is set and unchanged when
  unset, harness off → none.
- Gates: `pnpm test`, `pnpm typecheck`, `pnpm build`.
