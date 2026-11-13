# External-trigger push prototype (throwaway)

**Question:** can a Home Assistant-style button event reach an idle Sodalis
browser and produce a visible and audible listening cue? This prototype is
isolated on `prototype/external-trigger`; it does not change Sodalis' Home
entity or action allowlists, open the microphone, or call speech/LLM services.

## Run locally

From the repository root, install the workspace dependencies if needed, then:

```sh
pnpm prototype:external-trigger
```

Open <http://127.0.0.1:4177/external-trigger-prototype.html>. The launcher starts
a loopback-only mock API on port `3013` and the desktop Vite dev server on
`4177`. Press **Enable chime** once (browser audio requires a user gesture),
then use **Press stand-in button**. The API accepts only the fixed demo event;
no Home Assistant token or `.env` file is used. **Mute & dismiss** is one
control; when muted its label changes to **Unmute chime**. The microphone stays
off.

To inject the same local mock event with curl, leave the prototype running and
use another terminal:

```sh
curl -N http://127.0.0.1:3013/api/prototype/external-trigger/events
```

In a second terminal:

```sh
curl -sS -X POST http://127.0.0.1:3013/api/prototype/external-trigger/mock-event \
  -H 'content-type: application/json' -d '{"source":"mock-ha"}'
```

The browser's stand-in button sends that same POST route with `source=stand-in`
and a correlation ID. On the `curl -N` stream, expect an SSE event named
`demo_button_pressed`. The mock intentionally emits only that fixed event.

## Push channel and Home Assistant requirements

The server needs a long-lived SSE endpoint that keeps an idle browser connection
open, sends the event name/data, disables proxy buffering, logs connect/error/
reconnect timestamps, and sends periodic keepalives. SSE is used rather than a
WebSocket because this trigger is one-way server-to-browser; the existing
browser-to-server mock POST is ordinary HTTP. Native `EventSource` reconnects
after transient network errors. A Vite proxy `502` can close EventSource
rather than leave it in its native reconnecting state, so the client also
recreates a closed stream with logged exponential backoff (1, 2, 4, 8, then
10-second cap). The server sends named heartbeats every five seconds; the
browser closes/retries a stream silent for 15 seconds. This demo has no durable
event queue: a button press while the API is down is lost, but a later press
works after reconnect. Browser logs show `push-reconnect-scheduled`,
`push-reconnecting`, and `push-connected`.

The prototype runs same-origin in the browser through Vite's `/api/...` proxy,
so it needs no CORS exception. The API and UI bind to `127.0.0.1`; there is no
prototype login because it is a localhost demo. A real gateway needs an
authenticated same-origin session for SSE and a CSRF/origin check for the
trigger/mock POST; keep the HA credential only on the server. Do not expose an
unauthenticated event publisher or a Home Assistant token to browser code.

For a real simulator, a server-side Home adapter would connect to
`ws(s)://<HA-host>:8123/api/websocket`, wait for `auth_required`, send
`{"type":"auth","access_token":"<server-side long-lived access token>"}`,
wait for `auth_ok`, then send e.g.
`{"id":1,"type":"subscribe_events","event_type":"demo_button_pressed"}`.
Forward only that exact event through the Sodalis SSE route, handle command
results/ping-pong, and reconnect with backoff. The HA demo `event` entity has
device class `button`; the demo event bus event is `demo_button_pressed`.
The Home Assistant WebSocket docs and Core permissions code reviewed for this
prototype say **non-admin is not sufficient** for subscribing to that custom
event: `subscribe_events` permits only a fixed safe event allowlist to normal
users, and `demo_button_pressed` is not on it. The connection therefore needs a
long-lived access token belonging to an HA admin user; there is no narrower
entity-only scope for this arbitrary custom bus event. `subscribe_trigger` is
admin-only too. The current Home API's non-admin token and `OPERATIONS` allowlist therefore
must not be widened casually: `event`/`button` entities are intentionally not
exposed there. A future adapter needs an explicitly reviewed, server-side
subscription capability and a least-privilege permission story; the current
token alone cannot subscribe to this bus event. `subscribe_entities` can stream
states the user may read, but relying on state changes for this demo event
would be a different path and has not been verified here.

References: [HA WebSocket API](https://developers.home-assistant.io/docs/api/websocket/)
and [Core event subscription permissions](https://github.com/home-assistant/core/blob/dev/homeassistant/auth/permissions/events.py),
reviewed 2026-11-13. The existing Compose simulator uses the
`ghcr.io/home-assistant/home-assistant:2026.9.4` image and
`services/homeassistant/configuration.yaml`; its Core port is not published to
the host. The image is cached locally, but no initialized simulator instance or
server-side HA token was available during this check, so the real HA connection
was not run. The mock path below is the verified substitute.

## Measurements and quick check

The server timestamps each mock event. For a stand-in press, the browser
measures from the click with its monotonic clock to the second
`requestAnimationFrame` after the indicator update; this end-to-end measure
includes the mock POST, SSE delivery, and the visible frame without comparing
clocks across machines. For a curl/HA event, the page also estimates latency
from calibrated server/browser wall-clock timestamps and includes its uncertainty;
if that delta is within uncertainty it marks the estimate unresolved. The JSON
export records the server event, browser receipt, DOM update, and frame timestamps.
The stand-in attempt counts as a first-try success if the correlated SSE arrives
within five seconds; otherwise it is counted as a miss. Export the in-memory
session log as JSON before closing/reloading the tab. Reloading clears counters.
The on-screen counters cover intended attempts, first-try successes, misses, and
false activations (flag the latest trigger explicitly). Choose one of the three
felt-intrusiveness ratings: fine, uneasy, unacceptable.

**Automated/local verification (not the hands-on rubric run):**

- The API/UI started on loopback. A `curl` POST of `source=mock-ha` reached the
  visible browser over SSE and changed the indicator. For the same end-to-end
  stand-in path, five automated visible-browser presses each arrived on the
  first try and reached the indicator frame:

  | Press log time (UTC) | Indicator frame log time (UTC) | Monotonic latency |
  | --- | --- | ---: |
  | 2026-11-13T13:39:02.223Z | 2026-11-13T13:39:02.318Z | 94 ms |
  | 2026-11-13T13:39:02.539Z | 2026-11-13T13:39:02.615Z | 77 ms |
  | 2026-11-13T13:39:02.798Z | 2026-11-13T13:39:02.905Z | 107 ms |
  | 2026-11-13T13:39:03.074Z | 2026-11-13T13:39:03.172Z | 97 ms |
  | 2026-11-13T13:39:03.387Z | 2026-11-13T13:39:03.475Z | 87 ms |

  **Median 94 ms; range 77–107 ms; n=5 automated stand-in presses, 5/5 first
  try, 0 misses.** Each JSON entry includes its monotonic frame latency, event
  ID, server `firedAt`, and browser timestamps. This is an automated smoke check,
  not the rubric's hands-on trial or a statistical result. The separate
  server-event-to-browser-wall-clock estimate proved unreliable in this
  integrated browser (a later event yielded a negative delta due to clock skew),
  so the stable reported measure is trigger-press-to-indicator-frame. A real HA
  event on the evaluator's laptop still needs hands-on timing.

- To test recovery, the API process was killed while the page was connected.
  The browser logged connection failures and scheduled retries, then reconnected
  about ten seconds after the API was restarted. To repeat manually, leave the
  page and UI process open, stop the API process, then run
  `pnpm --filter @sodalis/server run prototype:external-trigger-api` in another
  terminal. A proxy `502` put EventSource in `CLOSED`, so the
  explicit 1/2/4/8/10-second backoff is needed in addition to EventSource's
  native retry behavior. A later mock event arrived. No event was queued during
  downtime.
- Idle/hidden observation: the visible browser remained connected for about
  43 seconds before the first curl event; no unsolicited activation occurred.
  In a separate hidden-tab run (`visibility=hidden`), the SSE event was
  received and the listening-state DOM changed, but the second animation-frame
  presentation callback did not run while hidden. This demonstrates that a
  background tab may defer paint; the sound context had not been unlocked in
  that hidden run, so audible background behavior was not verified. The visible
  chime path was unlocked by a user gesture and the oscillator playback call was
  logged, but a human did not listen to judge sound quality.
- OS sleep/wake was not tested. A laptop cannot establish tablet/kiosk sleep
  policy, long-term background survival, battery drain, or mic permission
  persistence. During OS sleep the browser may suspend networking/timers or lose
  the socket; this prototype queues nothing. The hands-on rubric check below
  remains unrun by the implementer.

**Hands-on check for the evaluator (about 10 minutes; not run by the implementer):**

1. Start the prototype as above and enable the chime with one click. Keep the
   browser visible while mixing about 10 minutes of TV, radio, and ordinary
   conversation playback. Do not press the stand-in during this period. Record
   any activation that you did not intend, then flag it in the UI. **Two or more
   false activations in 10 minutes is a red flag.**
2. Make about 20 intended Dutch attempts by pressing the on-screen stand-in
   button. Note first-try successes vs misses (the UI records this; a missing
   SSE activation within five seconds is a miss). **Five or more first-attempt
   misses out of 20 is a red flag.**
3. Choose the felt-intrusiveness rating (fine / uneasy / unacceptable), export
   the JSON log, and record any accessibility or annoyance concern. This is a
   laptop-only clean-check/not-clean-check, not evidence that a target rate or
   tablet behavior is met. Do not interpret the mock as a hardware button,
   and do not count this as an emergency or safety control.

## Known gaps

- No actual HA WebSocket client, HA token, or real `demo_button_pressed` event
  was used. The current non-admin token cannot subscribe to this event.
- No durable queue or missed-event replay; reconnect is transport recovery,
  not delivery guarantee. Vite proxy/server buffering behavior differs from a
  production gateway and requires verification there.
- Calibrated server/browser wall-clock timing can drift in the integrated
  browser; unresolved negative/within-uncertainty estimates are excluded. The
  reliable 94 ms report uses the browser monotonic clock for stand-in
  press-to-frame latency, not a real HA event timestamp.
- Browser autoplay policy requires the initial **Enable chime** gesture;
  external events cannot provide that gesture. The prototype does not open the
  mic or start a speech turn.
- OS-level sleep, tablet/kiosk behavior, and prolonged background limits were
  not verifiable on this laptop.
