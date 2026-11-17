---
title: External triggers in a smart home, buttons, satellites and Home Assistant events
label: wayfinder:research
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

Which physical or external triggers can start a Sodalis turn without touching
the tablet: Bluetooth or Zigbee buttons and remotes, a Home Assistant button
or event entity, a voice satellite such as ESPHome or Wyoming satellites, a
smart speaker, or a wearable or pendant? For each: how it reaches a browser
app (WebSocket, webhook, Web Bluetooth, server push), what the repo's Home
Assistant adapter and simulator (`TASKS/0032`, `TASKS/0038`) would need, setup
effort for a non-technical household, cost, and whether an older adult can
operate it reliably. Surface facts only; the decision comes later.

## Resolution

Findings: branch `research/external-triggers`, file `research/external-triggers.md` (never merged). The research agent read code and docs only; nothing was run.

- The repo has no inbound path: `HomeClient` only lists entities and calls services, there is no WebSocket or `EventSource` in non-test source, and the entity allowlist hides `event`, `button`, `binary_sensor`, and `assist_satellite`. A trigger would need a new server-to-browser push channel.
- The Home Assistant token is non-admin, so `subscribe_trigger`, `POST /api/events`, and `GET /api/stream` are unavailable; `subscribe_entities` only returns readable states.
- The simulator (HA 2026.9.4 demo) has a fake `event` entity (class `button`, event `pressed`) and a `button` entity, usable to simulate a button.
- Web Bluetooth works in Chromium only, needs a secure context and a user gesture to pair, and is absent on Safari, iOS, and Firefox. Browsers also block audible playback without a user gesture.
- Voice satellites send audio to Home Assistant's Assist pipeline, not to Sodalis (Voice PE: about 59 EUR, physical mute switch; `rhasspy/wyoming-satellite` archived 2026-01-27). Alexa and public webhooks need Home Assistant Cloud at 7.50 EUR/month.
- No pendant covered is a certified emergency device. Gaps: several prices, latency and false-trigger figures, mic-permission persistence, Web Push, Google Assistant, Apple Watch.
