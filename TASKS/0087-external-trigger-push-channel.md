# 0087 Add the external trigger push channel

Status: open
Priority: medium
Subsystem: server
Depends on: 0038, 0085

## Context

The [interaction-modes evaluation](../docs/evaluations/interaction-modes.md)
treats an external trigger (for example a physical button) as an optional
activation mode. The repo has no inbound path to the browser today, and the Home
Assistant token is non-admin. A prototype showed that a pushed event starts the
listening state at once and felt fine on a laptop; real hardware, real Home
Assistant events and a sleeping tablet were not tried.

## Acceptance Criteria

- Add an authenticated server-to-browser push channel with origin protection.
  The server subscribes to Home Assistant events with an admin-capable token
  held only on the server. Leave the entity allowlist for the assistant
  unchanged.
- A pushed trigger event starts the visible and audible listening state through
  the activation controller (0085). Events missed in an outage are not
  replayed; the browser reconnects on its own.
- The trigger is off until the administrator sets it up. Setup (admin token,
  button) and the connection status are administrator-only, outside the tablet
  screen. The user sees nothing when the channel is down.
- A trigger never executes a Home action; Home confirmations are unchanged.
- Add behaviour tests for authentication, origin checks, reconnect, off-by-default
  and the administrator-only status (ADR 0006, security, public server API).
- Measure pushed-event latency on one clock and record it in the evaluation.
- Verify on a laptop with the simulator. Deploying on a tablet requires the
  evaluation's "Future research on a tablet" measurements first (events while
  the page is visible, hidden, asleep, and after a network drop).

## Implementation Notes

Decisions: [T13](../WAYFIND/interaction-modes/T13-prototype-external-trigger-push-channel.md)
and [T16](../WAYFIND/interaction-modes/T16-how-activation-modes-combine.md).
Prototype branch: `prototype/external-trigger` (commit `4a2f3d8`). Research:
`research/external-triggers`. Web Bluetooth is not the primary route (Chromium
only) and voice satellites route audio to Home Assistant, not Sodalis.
