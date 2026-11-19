---
title: Prototype an external trigger over a server-to-browser push channel
label: wayfinder:prototype
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

> Historical prototype. The push channel is deferred, not the selected design
> for the future physical button. Hardware, transport and microphone placement
> remain undecided. See
> [ADR 0010](../../docs/adr/0010-button-activation-without-wake-word.md).

Can a physical-style button start a Sodalis turn without touching the tablet?
The repo has no inbound path from the server to an idle browser, the Home
Assistant token is non-admin, and the entity allowlist hides `event` and
`button` entities. Build a throwaway prototype that pushes the simulator's
demo button event (HA demo `event` entity, class `button`, fired by the
`demo_button_pressed` bus event) to the browser and shows the visible and
audible listening state, with an on-screen stand-in for the physical button.
Record what the push channel needs from the server and the Home adapter, the
activation latency, and what happens when the browser is idle or reconnecting,
then run the rubric's short hands-on check. Real hardware is out of this
ticket. Branch: `prototype/external-trigger` (pushed, never merged). Link the
prototype as an asset.

## Prototype built (awaiting hands-on check)

- Asset: branch `prototype/external-trigger` (`4a2f3d8`, pushed, never merged).
- Run: `pnpm prototype:external-trigger`, then open `http://127.0.0.1:4177/external-trigger-prototype.html`. A loopback mock sends `demo_button_pressed` over SSE.
- Needs from the server and Home adapter: server-side Home Assistant WebSocket auth with `subscribe_events` for the event. The non-admin token is insufficient (a long-lived admin token is needed). The Home allowlist was left unchanged. Production also needs authenticated push and CSRF/origin protection.
- Automated latency: median 94 ms (77-107 ms) over five stand-in click-to-frame runs, not the hands-on trial.
- Reconnect after a server kill and restart takes about 10 s. Events during the outage are not replayed. In a hidden tab the DOM updates but paint is deferred.
- Not verified: real Home Assistant, audible quality, sleep and tablet behaviour.

## Resolution

Evidence level: the user's hands-on trial on the laptop browser (session log exported 16:01 UTC, 2026-11-13, about 5 minutes, one connection, loopback mock Home Assistant source plus the on-screen stand-in). Real Home Assistant, real hardware, a sleeping or backgrounded tablet, and reconnects were not exercised in this trial.

| Measure | Result | Rubric |
|---|---|---|
| Intended attempts (stand-in) | 2 of 2 first-try successes; the rubric asks for about 20, so this is far too few to rate against the 80% gate | gate: at least 80% first-try |
| False activations | 0 (the only other triggers were deliberate mock events) | at most 0.25 per waking hour |
| Felt intrusiveness | fine | 3-point scale |
| Activation latency, stand-in | 9-14 ms to the indicator in the DOM and 35-38 ms to the painted frame, same clock | ranked only |
| Activation latency, pushed mock event | not reliable from this log: the 26 pushed events show a steady ramp from about 40 to about 390 ms (median 211 ms) that grows by a constant step per event, which looks like clock drift after the one-time server clock calibration (offset 324 ms, uncertainty 21 ms), not real delay; an earlier automated run measured a median of 94 ms (77-107 ms), also single-clock | ranked only |
| Idle and background | the tab was hidden and shown four times, but no event arrived while hidden, so the idle path is untested by the user; one connection, no reconnect | |

The user fired about 30 mock events in quick succession; each played the chime and showed the indicator without a dropped event.

### Decision

A server-to-browser push channel can start a Sodalis activation without touching the tablet: the indicator and chime fire immediately and the user rated it fine. The user's own judgement is that this is a nice option to have, and that with a real physical button it would work smoothly; that is a judgement, not a measurement here. Requirements recorded earlier stand: server-side Home Assistant WebSocket subscription for the event with an admin-capable token (the current non-admin token is not enough), the Home allowlist left unchanged for the assistant, and authenticated push with origin protection. Not settled by this ticket: the real-hardware path, the real-Home-Assistant event, latency of a pushed event on one trustworthy clock, behaviour when the tablet is asleep, backgrounded or reconnecting, and replay of events missed in an outage. Branch `prototype/external-trigger` stays as the record.
