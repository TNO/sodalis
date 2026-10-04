# 0032 Building the Home Assistant simulator service

Status: done
Priority: high
Subsystem: backend
Depends on: 0029

## Context

Sodalis needs a realistic but safe Home Assistant integration for development.
For now, the simulated service should run Home Assistant Core with
deterministic fake entities. Connecting to real Home Assistant instances and
designing multi-house access are separate follow-up tasks.

## Acceptance Criteria

- Add an independently runnable Sodalis Home API service behind its own
  Sodalis-owned API.
- Add a Compose-ready Home Assistant Core simulator with deterministic,
  documented entities and repeatable state.
- Support semantic entity discovery, state reads, and narrowly typed controls;
  never expose arbitrary Home Assistant service calls to the LLM.
- Allow no-confirmation basic controls only for:
  - lights: on/off and bounded brightness;
  - fans: on/off and bounded speed;
  - media players: play/pause and bounded volume;
  - climate: target temperature within a configurable safe range.
- Require deterministic confirmation for all other state-changing actions,
  including HVAC mode changes, scripts, scenes, locks, alarms, covers, and
  unknown domains or operations.
- Bind confirmation to the exact target and arguments using the existing
  action-confirmation safeguards.
- Require an explicit Home provider selection; include the simulator as an
  option, not an implicit fallback.
- Keep Home Assistant Core ports private to the Compose network; do not
  publish them on the host.
- Provide an optional same-origin gateway route to the simulator's admin UI
  for initial setup and token creation; do not expose a bypass around the
  gateway.
- Provide a one-time setup for a dedicated low-privilege Home Assistant token;
  store it only in ignored local configuration, never in the repository.
- Test the API and policy against the deterministic simulator.

## Implementation Notes

- Do not connect to real homes or introduce multi-tenant behavior in this
  task.
- The Home API contract should allow a later adapter to connect to an existing
  Home Assistant instance without changing the browser contract.
- The browser-facing routes are added to the same-origin gateway in task
  `0034`.

## Agent Notes

- User selected Home Assistant Core with fake entities for the simulator, not
  a lightweight imitation service.
- Climate's no-confirm control is limited to bounded target temperature.
- 2026-10-04 Copilot: Added Home API and Core REST adapter with explicit
  simulator selection, demo Core configuration, typed controls, server-side
  exact-action confirmation, Celsius temperature bounds, and ignored token
  workflow. The optional Vite same-origin gateway root serves Core admin
  during onboarding; Compose routes follow in 0034. Verified Home API/adapter
  tests and server/assistant/desktop typechecks. Core's demo has additional
  entities and non-admin tokens are not entity-scoped.
