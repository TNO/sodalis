# 0038 Connecting to a real Home Assistant instance

Status: open
Priority: medium
Subsystem: home
Depends on: 0032, 0033, 0034

## Context

After the deterministic Home Assistant Core simulator is working, Sodalis
needs an explicit adapter to an existing real Home Assistant instance. The
first real integration is single-instance only; connectivity and identity for
approximately 500 houses are a separate design task.

## Acceptance Criteria

- Implement a server-side adapter to an existing Home Assistant instance.
- Reuse the Home API contract and narrowly typed actions proven by the
  simulator.
- Read the instance URL and a dedicated token from ignored local secret
  configuration; never expose the token to the browser or LLM.
- Preserve the low-risk no-confirm allowlist for basic bounded light, fan,
  media-player, and climate target-temperature controls.
- Require exact-action confirmation for every other state-changing operation.
- Do not expose arbitrary Home Assistant service calls.
- Make real-instance mode an explicit provider selection; never silently
  switch between real and simulated homes.
- Test against the simulator and document local configuration.

## Implementation Notes

- Do not deploy or manage users' real Home Assistant installations from Sodalis
  Compose.
- Keep multi-house identity, routing, credential isolation, and fleet
  operations out of scope; task `0040` is design-only follow-up.

## Agent Notes

- Current scope is one explicitly selected Home Assistant instance.
