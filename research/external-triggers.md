# External triggers in a smart home: buttons, satellites and Home Assistant events

- **Ticket:** `WAYFIND/interaction-modes/T03-external-triggers-smart-home.md` (a
  `wayfinder:research` ticket; the interaction-modes map is in the working tree
  of the `evaluate-sodalis-interaction-modes` worktree and not yet committed)
- **Date:** 2026-11-13 (web sources fetched on this date; Home Assistant docs
  were at version 2026.11)
- **Status:** Research notes. Facts only; no decision or recommendation.
- **Location:** `research/external-triggers.md` as requested. The repo has no
  `research/` folder; `docs/evaluations/` holds final analyses (see its
  README) and `TASKS/` holds progress notes.

## Question

Which physical or external triggers can start a Sodalis turn without touching
the tablet (Zigbee or Bluetooth buttons, a Home Assistant button or event
entity, voice satellites, a smart speaker, a wearable or pendant)? For each:
how it reaches a browser app, what the repo's Home Assistant adapter and
simulator would need, setup effort, cost, and reliability for an older adult.

## 1. Repo baseline (what exists today)

All paths are relative to the repo root.

- **The Home service is request/response only.** `HomeClient` has two methods,
  `listEntities()` and `callService()` (`apps/server/src/home/client.ts:9-16`).
  `HomeAssistantClient` implements them with `fetch` against Home Assistant's
  REST `/api/states` and `/api/services/...`
  (`apps/server/src/home/client.ts:26-83`).
- **No push path exists anywhere.** A search of the non-test TypeScript in
  `apps/`, `packages/` and `scripts/` finds no `WebSocket`, `EventSource` or
  `subscribe_*` use. The only streaming is the per-turn
  `text/event-stream` response of `POST /api/assistant/turns`
  (`apps/server/src/assistant/app.ts:272,423`); the gateway disables buffering on
  its proxied routes (`services/gateway/Caddyfile.desktop:4-23`). The browser
  therefore has no channel on which the server can notify it while idle.
- **Entities are filtered by an operation allowlist.**
  `GET /api/home/entities` returns only entities whose domain appears in
  `OPERATIONS` (light, fan, media_player, climate, script, scene, lock,
  alarm_control_panel, cover) (`apps/server/src/home/app.ts:22-42,103-115`).
  `event`, `button`, `binary_sensor`, `sensor` and `assist_satellite` entities
  are not returned, and there is no `button.press` operation.
- **Token model.** The Home service uses one dedicated non-admin long-lived
  token kept in ignored local configuration (`apps/server/README.md:472-478`;
  `TASKS/0032-home-assistant-simulator-service.md:40`). `TASKS/0038:20-21`
  requires that the token is never exposed to the browser or the LLM.
- **Providers.** `apps/server/src/home/main.ts:5-6` accepts only
  `HOME_PROVIDER=simulator`; `scripts/stack-config.ts:228-257` also accepts
  `external-api`. `TASKS/0038` (real Home Assistant instance) is `open`.
- **Simulator.** Compose runs Home Assistant Core image `2026.9.4`
  (`compose.yaml:131`) with `default_config:` and `demo:`
  (`services/homeassistant/configuration.yaml:1-2`). At that tag the demo
  integration loads the `button` and `event` platforms
  (`homeassistant/components/demo/__init__.py`, lines 25 and 32 at
  <https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/demo/__init__.py>).
  The demo event entity has device class `button`, event type `pressed`, and
  fires when the bus event `demo_button_pressed` occurs
  (<https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/demo/event.py>).
  Not run-verified in this repo's stack. The README guarantees repeatable
  initial state only for four demo entities (`apps/server/README.md:479-483`).
- **Where a turn starts in the app.** Hold-to-talk calls
  `speechInput.start()` / `.stop()` from pointer and key handlers
  (`apps/desktop/src/avatar/AvatarConversationCard.ts:240-254,344-366`); a
  final transcript or typed text calls
  `conversation.submitUserMessage(text)`
  (`apps/desktop/src/avatar/DesktopAvatarOverlay.ts:355,1039`;
  `packages/assistant/src/WorkflowConversation.ts:158`). The microphone is
  opened with `getUserMedia({ audio: true })`
  (`packages/speech/src/BrowserMicrophoneCapture.ts:87`). The status text
  reads "Microphone is off. Hold to talk or type a message."
  (`AvatarConversationCard.ts:238`).

## 2. How a signal can reach a browser app

Facts about the transports; which one fits Sodalis is not assessed here.

| Path | Documented behaviour | Source |
| --- | --- | --- |
| HA WebSocket API `/api/websocket` | Client sends `auth` with an access token, then `subscribe_events`, `subscribe_entities` or `subscribe_trigger`; HA pushes `event` messages. "Most event types" and `subscribe_trigger` and `fire_event` need an admin; `subscribe_entities` sends "all states the user may read" then changes. `home-assistant-js-websocket` handles auth, reconnect and subscriptions. | <https://contributors.home-assistant.io/core/internals/websocket-api/> |
| HA REST API | `GET /api/states` for polling. `POST /api/events/<type>` and `GET /api/stream` (SSE of all events) are admin-only; the docs call WebSocket `subscribe_events` "the better choice for new code". | <https://contributors.home-assistant.io/core/internals/rest-api/> |
| HA webhook trigger (inbound to HA) | An external caller POSTs/PUTs to `/api/webhook/<id>` to start an HA automation; no token needed, so the ID is a secret. Default `local_only: true`. HA's docs say not to use webhooks for automations that are destructive or create safety issues. Home Assistant Cloud can give a public address. | <https://www.home-assistant.io/triggers/webhook/> |
| HA automation to outbound HTTP | `rest_command` exposes configured HTTP requests (url, method, headers, payload templates) as actions callable from automations, so HA can call a URL on another service. | <https://www.home-assistant.io/integrations/rest_command/> |
| Web Bluetooth (browser talks to the device) | Secure context required; `requestDevice()` needs explicit user permission and transient activation; `getDevices()` lists previously granted devices. | <https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API> |
| Browser to server | Existing: HTTP `fetch` plus a streamed response per turn (section 1). WebSocket or SSE from server to idle browser: not implemented. | repo, section 1 |

Browser constraints that apply to any trigger that arrives without a touch:

- **Web Bluetooth support.** Chrome 70+ (Chrome Android 56+), Edge, Opera and
  Samsung Internet; Firefox: not supported; Safari and Safari on iOS: not
  supported; Android WebView: not supported
  (<https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Bluetooth.json>).
  On Linux Chrome it is "partially implemented and not supported" without a
  flag; `getDevices()`, `watchAdvertisements()` and persistent device
  permissions are behind `chrome://flags` entries
  (<https://github.com/whatwg/bluetooth/blob/main/implementation-status.md>).
- **Audio output without a gesture.** Browsers "generally" block audible
  playback started programmatically in a tab without prior user interaction
  unless the site is allowlisted or the audio is muted
  (<https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay>).
  An external trigger supplies no gesture.
- **Microphone permission persistence across an unattended start** is not
  covered by the sources fetched (see section 6).

## 3. Comparison

"HA path" is how the signal enters Home Assistant. All rows assume Home
Assistant is the hub; direct browser paths are noted where they exist.

| Trigger | HA path | Reaches Sodalis via | Adapter/simulator work (see section 4) | Setup for a non-technical household | Indicative cost | Reliability notes |
| --- | --- | --- | --- | --- | --- | --- |
| Zigbee button/remote (IKEA, Aqara, Sonoff, Hue) | ZHA or Zigbee2MQTT; `event` entity, device trigger, or MQTT `action` | HA WebSocket subscription or HA automation calling out; then server to browser push | New event subscription, new entity domains, new browser push channel | Needs a Zigbee coordinator and pairing; HA-side automation | Coordinator plus button (e.g. Sonoff SNZB-01P US$16.90 page metadata); other brands unverified | Battery end device; sleeps; ZHA says coverage depends on mains-powered router devices |
| BLE button (BTHome, e.g. Shelly BLU Button1) | HA Bluetooth + BTHome; ESPHome Bluetooth proxy extends range | Same as Zigbee. Direct Web Bluetooth only on Chrome/Android | Same as Zigbee | Auto-discovered by HA when Bluetooth is enabled; needs HA host Bluetooth or a proxy | Price unverified (page rate-limited) | "Over a year on a single battery" (BTHome); advertisement broadcast |
| HA `button` / `event` entity (as the integration point) | Built-in building blocks provided by integrations | HA WebSocket (`subscribe_entities`) or `event.received` trigger plus outbound call | Add domains to the allowlist; add a subscription | Depends on the underlying device | None by itself | `button` is an action target (press from UI or action), `event` is the input signal |
| Voice satellite (HA Voice PE, ESPHome DIY, Linux Voice Assistant) | `assist_satellite` entity; audio goes to HA's Assist pipeline | Satellite state triggers or a pipeline conversation agent; see 5.4 | New subscription plus a decision on who handles audio (not assessed) | Voice PE: USB-C plus HA setup wizard | Voice PE US$69 / EUR 59 MSRP; DIY ATOM Echo "$13" | Physical mute switch; wake-word false activations not measured here |
| Smart speaker (Alexa; Google not fetched) | Alexa Smart Home skill or custom skill | Routine or skill reaching HA; then as above | Same as Zigbee; custom skill needs public HTTPS 443 | Developer/AWS accounts, or paid HA Cloud | HA Cloud EUR 7.50/month (EUR 75/year), tax excluded | Cloud dependency |
| Wearable (Wear OS watch) | Wear OS app runs HA `button`, `script`, `scene`, `switch`... entities | Entity state change, then as above | Same as Zigbee | Needs Android phone to log in, then watch standalone | Watch hardware not priced | Wi-Fi/cellular on watch; tap-to-run |
| Pendant / panic button | Zigbee or BLE button in a pendant form factor | Same as the chosen radio | Same as Zigbee | Same as Zigbee | Not researched | Not a certified emergency device unless the vendor says so; none verified |

## 4. What the repo's adapter and simulator would need (facts per gap)

These are the observable differences between what the code has and what each
transport in section 2 requires. They are not a design.

1. **An inbound event source in the Home service.** `HomeClient`
   (`client.ts:9-16`) has no subscribe or event method, and `HomeAssistantClient`
   uses only REST (`client.ts:38-83`). Any WebSocket path needs a new client
   that performs the `auth_required`/`auth` handshake, sends `subscribe_*`
   commands with increasing `id`, handles `ping`/`pong`, and reconnects
   (WebSocket API doc). `home-assistant-js-websocket` provides these
   <https://github.com/home-assistant/home-assistant-js-websocket>.
2. **Permissions of the existing token.** The token is non-admin
   (`apps/server/README.md:477`). `subscribe_trigger`, `fire_event`,
   `POST /api/events/<type>` and `GET /api/stream` are admin-only; most
   `subscribe_events` event types need an admin. `subscribe_entities`
   works for the states the user may read (WebSocket and REST docs above).
   `TASKS/0032:64` records that "non-admin tokens are not entity-scoped".
   Whether a non-admin token receives `state_changed` for an `event` entity
   through `subscribe_entities` is derived from the docs, not tested.
3. **Allowlist and entity discovery.** `OPERATIONS` and the filter at
   `app.ts:22-42,103-115` hide `event`/`button`/`binary_sensor`/
   `assist_satellite` entities. A press of a button entity from Sodalis would
   need a new typed operation; the repo rule is "never expose arbitrary Home
   Assistant service calls" (`TASKS/0032:22`, `TASKS/0038:25`).
4. **A browser notification channel.** Section 1 shows none exists, so any
   HA-originated trigger needs a server-to-browser path (WebSocket, SSE or
   another). The Caddy gateway already routes `/api/home/*` with buffering
   disabled (`Caddyfile.desktop:20-24`). Web Push was not researched.
5. **App entry point.** The existing entry points for starting a turn are
   `speechInput.start()` and `conversation.submitUserMessage()` (section 1).
   An external event has no pointer event, so Autoplay and microphone
   rules in section 2 apply.
6. **Simulator.** The Core demo already contains a fake `event` entity
   (`pressed`, device class `button`) driven by the bus event
   `demo_button_pressed`, and a fake `button` entity (section 1). Firing the
   bus event over REST is admin-only (REST doc), so a deterministic test
   would need an admin token or an HA automation in
   `services/homeassistant/configuration.yaml`, which currently contains
   only `default_config:` and `demo:`. `TASKS/0032` requires the simulator
   to have "deterministic, documented entities".
7. **Real instance.** `main.ts:5-6` rejects anything but the simulator;
   `TASKS/0038` is open. Zigbee, Bluetooth and satellite hardware exist only
   on a real instance.

## 5. Per-trigger notes

### 5.1 Zigbee buttons and remotes (ZHA, Zigbee2MQTT)

- ZHA exposes `button`, `event` and `binary_sensor` entities and requires a
  Zigbee coordinator, "typically a USB dongle" on the HA host; HA recommends
  the Home Assistant Connect ZBT-2
  (<https://www.home-assistant.io/integrations/zha/>). Price: not found on the
  page text fetched.
- Zigbee2MQTT publishes the button press as an `action` property, and offers
  three HA hooks: MQTT device trigger (recommended), the `event` entity
  (labelled experimental) and a deprecated `action` sensor
  (<https://www.zigbee2mqtt.io/guide/usage/integrations/home_assistant.html>).
  Actions are discovered in HA "after the device generates them at least once",
  so each button must be pressed once.
- Example device (IKEA RODRET, E2201): one AAA battery; sleeps and "will not
  respond to any Z2M commands" while asleep; pairing is pressing the pair
  button four times; actions single/double/long press of on/off
  (<https://www.zigbee2mqtt.io/devices/E2201.html>). Aqara WXKG11LM
  exposes `single, double, triple, quadruple, hold, release` (not all versions);
  documented disconnect causes include weak signal and low battery voltage
  (<https://www.zigbee2mqtt.io/devices/WXKG11LM.html>).
- Aqara states "2 Years Battery Life" for the Wireless Mini Switch and
  "An Aqara hub is required"; the product page also
  describes it as an "emergency button" that pushes a notification and sounds
  an alarm via the Aqara hub
  (<https://www.aqara.com/en/product/wireless-mini-switch/>). The page makes no
  certification claim.
- Coverage: ZHA says Zigbee networks "depend heavily on having multiple Zigbee
  Router devices" (mains-powered); battery remotes are end devices; battery-
  powered devices with no activity can be marked unavailable after a
  configurable time (<https://www.home-assistant.io/integrations/zha/>).
- Price evidence found: Sonoff SNZB-01P page metadata lists US$16.90
  (<https://www.sonoff.tech/product/gateway-and-sensors/snzb-01p/>; product
  identity taken from the URL, page later rate-limited). IKEA, Hue and Aqara
  prices could not be retrieved from manufacturer pages.

### 5.2 Bluetooth Low Energy buttons

- BTHome is an open BLE format for "sensor data and button presses",
  "Devices can run over a year on a single battery", and HA discovers BTHome
  devices automatically once the Bluetooth integration works
  (<https://bthome.io/>, <https://www.home-assistant.io/integrations/bthome/>).
  Shelly BLU Button1 is listed as a BTHome button with single, double, triple
  and long-press events.
- HA's Bluetooth integration supports BLE only, and ESPHome Bluetooth proxies
  extend range; broadcast data (many BTHome sensors) does not use connection
  slots (<https://www.home-assistant.io/integrations/bluetooth/>,
  <https://esphome.io/components/bluetooth_proxy/>). ESPHome warns that BLE
  components "are known to cause issues" when combined with Voice Assistant
  components on the same device
  (<https://esphome.io/components/voice_assistant/>).
- **Direct Web Bluetooth:** only Chromium browsers; user gesture and permission
  prompt on first pairing; no Safari/iOS/Firefox (section 2). Receiving a
  broadcast press from a browser corresponds to advertisement scanning;
  `watchAdvertisements()` is behind a Chrome flag per the implementation-status
  page. Whether any specific button's advertisements can be consumed that way
  was not tested.

### 5.3 Home Assistant `button` and `event` entities

- `event` entity: a momentary signal; state is a timestamp of the last event
  plus an `event_type` (for example single, double, long press); introduced in
  HA 2023.8; trigger `event.received`; device classes `button`, `doorbell`,
  `motion` (<https://www.home-assistant.io/integrations/event/>).
- `button` entity: "works like a physical push button"; state is the time it was
  last pressed from the UI or by an action; trigger `button.pressed`
  (<https://www.home-assistant.io/integrations/button/>). The Wear OS app can
  execute `button` and `input_button` entities (section 5.6).
- Automation triggers include state changes, events, webhooks and sentences
  (<https://www.home-assistant.io/docs/automation/trigger/>).

### 5.4 Voice satellites (Voice PE, ESPHome, Wyoming)

- Assist runs in the companion app, on Voice PE and on ESPHome devices
  (<https://www.home-assistant.io/voice_control/>). ESPHome devices with a
  microphone "stream the audio to Home Assistant" for processing by Assist; the
  `voice_assistant` component exposes callbacks such as `on_wake_word_detected`,
  `on_stt_end` (transcript as `x`) and `on_listening`
  (<https://esphome.io/components/voice_assistant/>).
- The `assist_satellite` building block provides triggers (started listening,
  started processing, started responding, became idle) and actions `announce`,
  `ask_question` and `start_conversation`
  (<https://www.home-assistant.io/integrations/assist_satellite/>).
  `start_conversation` requires a conversation agent that supports
  conversations, such as OpenAI or Google Generative AI; the built-in agent
  does not yet (<https://www.home-assistant.io/actions/assist_satellite.start_conversation/>).
- HA documents Dutch (Netherlands) among the languages supported by Assist
  (<https://www.home-assistant.io/voice-pe/>).
- Voice PE: dual microphones, a physical mute switch that "physically cuts
  power to the microphones", a button, an LED ring, speaker, USB-C power; MSRP
  US$69 / EUR 59, "Preview edition", setup via "one USB-C cable and setup
  wizard" (<https://www.home-assistant.io/voice-pe/>).
- DIY satellite: the "$13" ATOM Echo tutorial needs Chrome/Chromium on a
  desktop (not Android/iOS) to flash it, 2.4 GHz Wi-Fi, a wake word enabled and
  Home Assistant Cloud or a configured pipeline
  (<https://www.home-assistant.io/voice_control/thirteen-usd-voice-remote/>).
- Wyoming is the protocol that connects external STT, TTS and wake-word
  services to Assist; its IoT class is "Local Push"
  (<https://www.home-assistant.io/integrations/wyoming/>). The
  `rhasspy/wyoming-satellite` repository was archived on 2026-01-27
  (<https://github.com/rhasspy/wyoming-satellite>); HA's voice page lists the
  experimental Linux-Voice-Assistant (ESPHome protocol) as an alternative.
- Reaching Sodalis: audio from a satellite goes to HA's pipeline, not to the
  Sodalis server. The sources fetched document three signals HA could forward:
  satellite state triggers, the ESPHome `on_wake_word_detected` callback, or
  the transcript. Which of them could start a Sodalis turn is not assessed.

### 5.5 Smart speaker (Alexa, Google)

- With Home Assistant Cloud (paid after a 30-day trial; EUR 7.50/month or
  EUR 75/year, tax excluded) Alexa connects "in a few simple clicks"
  (<https://www.home-assistant.io/integrations/alexa/>,
  <https://www.nabucasa.com/pricing/>).
- Manual options: a Smart Home skill (utterances without the skill name,
  Alexa routines can control exposed devices) or a Custom Skill for custom
  commands, which needs HA reachable from the internet over HTTPS on port 443
  plus an Amazon Developer account (and an AWS account for the Smart Home
  skill) (<https://www.home-assistant.io/integrations/alexa/>).
- The Smart Home skill is documented as Alexa controlling HA devices; the
  Custom Skill is documented as "custom commands". Neither was checked against
  a Sodalis flow, and the docs fetched do not say how a custom command reaches
  an HA event. Google Assistant docs were not fetched.

### 5.6 Wearables and pendants

- The HA Wear OS app works standalone over Wi-Fi/cellular after logging in via a
  paired Android phone (Android 8+); the home screen can toggle/execute
  `button`, `cover`, `fan`, `input_boolean`, `input_button`, `light`, `lock`,
  `scene`, `script` and `switch`; it has an Assist tile
  (<https://companion.home-assistant.io/docs/wear-os/>). Apple Watch and other
  wearables were not researched.
- Pendants: no pendant product page was fetched. A pendant-style button on
  Zigbee or BLE would reach HA like a section 5.1/5.2 device. Statements about
  emergency use found: Aqara's mini switch page says it "can also act as an
  emergency button" using its own hub (5.1). HA's webhook documentation
  warns against webhooks for anything that "can create safety issues". No
  source fetched states that any of these are certified personal-alarm or
  medical devices.

## 6. Gaps / unverified

- **Prices:** IKEA (RODRET, SOMRIG), Philips Hue, Aqara and Shelly pages
  could not be read (JavaScript-only or rate-limited), and the ZBT-2 coordinator
  price was not on the fetched page text. Only the prices cited above are
  verified, and the Sonoff figure is from page metadata.
- **No hands-on testing:** nothing was run. The demo `event`/`button`
  entities were read from source at tag `2026.9.4`, not started in the
  repo's Compose stack. Non-admin `subscribe_entities` behaviour on `event`
  entities is derived from documentation.
- **Latency, false triggers and range** figures for each device class were not
  found in primary sources; battery claims are vendor claims (Aqara 2 years,
  BTHome "over a year").
- **Microphone permission persistence** in a kiosk browser, and whether Chrome
  allows `getUserMedia` to start without a gesture once granted, were not
  verified. Chrome-flag behaviour for `watchAdvertisements()` was read from
  the implementation-status page only.
- **Browser push** (Web Push, tablet OS and browser unknown in the repo) was not
  researched; the repo's docs name no target browser or OS for the tablet.
- **Google Assistant/Nest**, Apple Watch, phone wake-word (Android Assist),
  and emergency-pendant products and their certification status were not
  researched.
- **Voice satellite to Sodalis:** whether Voice PE's button or wake word can be
  surfaced to a third party as an HA entity or event (other than through
  `assist_satellite` triggers and ESPHome callbacks) was not confirmed from
  firmware sources.
- **Zigbee2MQTT `event` entities** are marked experimental in its docs; other
  integrations' event entities are not marked so.
- **IKEA/Hue/Aqara pairing flows** other than RODRET and WXKG11LM (from
  Zigbee2MQTT) were not read.

## 7. Sources

- Home Assistant: [Event](https://www.home-assistant.io/integrations/event/),
  [Button](https://www.home-assistant.io/integrations/button/),
  [Automation triggers](https://www.home-assistant.io/docs/automation/trigger/),
  [Webhook trigger](https://www.home-assistant.io/triggers/webhook/),
  [WebSocket API](https://contributors.home-assistant.io/core/internals/websocket-api/),
  [REST API](https://contributors.home-assistant.io/core/internals/rest-api/),
  [rest_command](https://www.home-assistant.io/integrations/rest_command/),
  [ZHA](https://www.home-assistant.io/integrations/zha/),
  [BTHome](https://www.home-assistant.io/integrations/bthome/),
  [Bluetooth](https://www.home-assistant.io/integrations/bluetooth/),
  [Assist Satellite](https://www.home-assistant.io/integrations/assist_satellite/),
  [Wyoming](https://www.home-assistant.io/integrations/wyoming/),
  [Voice PE](https://www.home-assistant.io/voice-pe/),
  [Assist overview](https://www.home-assistant.io/voice_control/),
  [Alexa](https://www.home-assistant.io/integrations/alexa/),
  [Wear OS app](https://companion.home-assistant.io/docs/wear-os/).
- ESPHome: [voice_assistant](https://esphome.io/components/voice_assistant/),
  [bluetooth_proxy](https://esphome.io/components/bluetooth_proxy/).
- Zigbee2MQTT: [Home Assistant integration](https://www.zigbee2mqtt.io/guide/usage/integrations/home_assistant.html),
  [E2201](https://www.zigbee2mqtt.io/devices/E2201.html),
  [WXKG11LM](https://www.zigbee2mqtt.io/devices/WXKG11LM.html).
- BTHome: <https://bthome.io/>. Aqara: <https://www.aqara.com/en/product/wireless-mini-switch/>.
  Nabu Casa pricing: <https://www.nabucasa.com/pricing/>.
- Web platform: [MDN Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API),
  [browser-compat-data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Bluetooth.json),
  [implementation status](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md),
  [MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
