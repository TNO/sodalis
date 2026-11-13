# Smart-home signals that hint a person is about to talk to Sodalis

Ticket: `WAYFIND/interaction-modes/T04-sensor-signals-for-intent-to-talk.md` (the file exists only in the
`evaluate-sodalis-interaction-modes` worktree, not in this branch's tree).
Facts only; no decision. Research date 2026-11-13. Repo state: `origin` merge commit `c8aef76` (PR #33).

## 1. Short answer

- **Repo:** none of the candidate signals (presence/motion, door, doorbell, kettle/TV, person/tracker) reaches the
  assistant or the browser as a live, pushed signal today.
  - The Home API lists only nine controllable Home Assistant domains and has no event stream.
  - The real-HA adapter (0038) is open.
  - The sensor journey (0070) can read a *historical* SQLite snapshot that contains `Presence` and `DoorOpen`
    series, only on demand through the LLM tool `read_external_data`.
- **Prior art:** sensor-based interruptibility prediction reaches roughly 70–80 % accuracy in lab/field studies of
  office workers and phone users. I found no study that measures a smart-home-sensor "about to talk" predictor
  for older adults.
- **Closest shipped product:** Google Nest Hub Max "Look and Talk" uses camera face detection plus a 5 ft
  proximity gate. It is the only reviewed system that uses distance to the device as an intent signal. It needs a
  camera, and Google gives no public accuracy figure.

## 2. Which signals the repo already exposes

### 2.1 Home API (live Home Assistant state, `apps/server/src/home`)

| Fact | Citation |
| --- | --- |
| Only `HOME_PROVIDER=simulator` starts; any other value throws "other Home providers are not available yet". | `apps/server/src/home/main.ts:5-7` |
| Entity read = `GET {HA}/api/states`, mapped to `{entityId, name, domain, state, attributes}`. `last_changed`/`last_updated` are dropped even though HA returns them. | `apps/server/src/home/client.ts:1-7`, `:50-72` |
| `/api/home/entities` and `/api/home/entities/:id` return only entities whose domain is in `OPERATIONS`. Visible domains: `light, fan, media_player, climate, script, scene, lock, alarm_control_panel, cover`. | `apps/server/src/home/app.ts:22-42`, `:103-118` |
| So `binary_sensor` (motion/occupancy/door), `sensor`, `person`, `device_tracker`, `event` (doorbell) and `switch` (kettle plug) entities are filtered out. `media_player` is visible, so TV/media on/off/playing state is readable on demand. | `apps/server/src/home/app.ts:104-110` |
| No push channel. Routes: `/healthz`, `/readyz`, `GET /api/home/entities[/:id]`, `GET/POST /api/home/actions`, `POST /api/home/confirm`. No websocket or SSE. | `apps/server/src/home/app.ts:93-178` |
| `HomeClient` interface has only `listEntities()` and `callService()`. | `apps/server/src/home/client.ts:9-16` |
| Compose: `home` service (profile `home-api`) fixed to `HOME_PROVIDER: simulator`; `homeassistant` (profile `home-simulator`) uses image `ghcr.io/home-assistant/home-assistant:2026.9.4`. | `compose.yaml:114-134` |
| Simulator config is just `default_config:` + `demo:`. The HA demo platform ships a few fake entities. `demo/binary_sensor.py` includes a `motion` device-class sensor, and the demo registers the `event` platform. The repo does not document the demo entity list. 0032 notes "Core's demo has additional entities". | `services/homeassistant/configuration.yaml:1-2`; `TASKS/0032-home-assistant-simulator-service.md` (Agent Notes); HA core `homeassistant/components/demo/binary_sensor.py` (dev branch, not the pinned 2026.9.4 tag) |

Task status:
- **0032** (simulator service): done.
- **0038** (real HA instance): `Status: open`, "Current scope is one explicitly selected Home Assistant
  instance", not implemented.
  - `TASKS/0038-real-home-assistant-adapter.md:1-8`, Agent Notes.
  - `apps/server/src/home/main.ts:5-7`.

### 2.2 Harness sensor journey (`apps/server/src/assistant/harness`, task 0070)

| Fact | Citation |
| --- | --- |
| Tool `read_external_data` resolves a discovered reference ID and reads the latest value plus an optional range of ≤ 48 h. It is LLM-pulled, read-only and request/response. | `apps/server/src/assistant/harness/tools.ts:287-297`; `docs/architecture/companion-harness.md:180`; `apps/server/src/assistant/harness/externalData.ts:11-17` |
| Only a SQLite `readings` table is readable. The graph names an endpoint; Sodalis maps it to a configured file (`HOME_DATA_SQLITE_FILE`, `HOME_DATA_SQLITE_ENDPOINT`). Without the file, reads return `unavailable`. | `externalData.ts:3-9`, `:113-133`; `docs/development-stack.md:1224-1227` |
| Result model: `value`, `observedAt`, optional `event`, `ageMinutes`, `freshness` = `current` \| `stale` \| `last_change`. Periodic series are `stale` after 15 min (`periodicStaleAfterMs`). A series whose reporting is `state_changes` returns `last_change`, i.e. the latest event persists until the next change. | `externalData.ts:15-16`, `:24-57`, `:171-178` |
| Graph entity kinds returned to tools include `PresenceSensor`, `DoorSensor`, `Door`, `IndoorDoor`, `ExteriorDoor`, `Appliance`, `Person`, `AssistedResident`, `Household`, `Space`/`Bedroom`. | `apps/server/src/assistant/harness/homeGraph.ts:8-16` |
| The inspected simulator snapshot has four `readings` series: `couple-apartment/door/DoorOpen`, `.../presence/Presence`, `.../temp-hum/Humidity`, `.../temp-hum/Temperature`. Only Temperature is exercised end to end. The snapshot ends 2026-10-19; the test pins it at two fixed clocks and reports it as `current` (2 min old) or `stale` (23,881 min old). | `docs/evaluations/companion-harness.md:192-250` (series list at `:218-221`; results at `:236-242`) |
| Unit test seeds a `presence` series (`event_type` `presence_detected`, value 1) and asserts `freshness: "last_change"`. | `apps/server/src/assistant/harness/tools.test.ts:28`, `:65-66` |
| The snapshot projection and tests are opt-in (`SODALIS_SENSOR_SNAPSHOT_DIR`), skipped in CI, and use a scripted provider. Real-model quality and live-source acceptance are "not established". | `docs/development-stack.md:1253-1281`; `TASKS/0070-complete-sensor-journey.md` (Context, Completion) |
| The snapshot data is external and not published. The repo has no live presence/door feed, only the offline file path. | `docs/evaluations/companion-harness.md:192-205` |
| Memory observation sources default to `home` (`MEMORY_OBSERVATION_SOURCES`). I did not trace what this ingests. | `apps/server/src/assistant/memoryConfig.ts:187` |

### 2.3 Other repo signals relevant to "last interaction / receptivity"

- **Conversation state.** The desktop avatar overlay tracks `idle | listening | thinking | speaking | error`.
  - `apps/desktop/src/avatar/AvatarViewport.ts:18`
  - `apps/desktop/src/avatar/DesktopAvatarOverlay.ts:170`, `:386-390`
  - `apps/desktop/src/avatar/SpeechPlaybackController.ts:320`
  - This is conversation state, not a persisted "time since last interaction" timestamp. I did not find one.
- **`AttentionManager`** (`apps/desktop/src/avatar/AttentionManager.ts:1-40`) is avatar gaze and highlight toward UI
  targets. It is not user-attention sensing.
- **No client-side presence sensing.** I found no camera, proximity, geolocation or ambient-sensor code under
  `apps/desktop/src`, `packages/`, `harness/` or `services/`. I did not run an exhaustive grep for every API name.
  - `harness/` holds only `harness-design.md` and `knowledge-graph-diagrams.md`.
  - `services/homeassistant` holds only `configuration.yaml`.
- **Time of day / routines.** No time-of-day or routine logic found; `MEMORY_OBSERVATION_SOURCES` is the only
  related hook (see 2.2).

## 3. What Home Assistant can supply (primary docs)

| Candidate signal | HA entity type and class | Source |
| --- | --- | --- |
| Motion | `binary_sensor`, class `motion` ("Shows whether motion is detected", Detected/Clear), with triggers "Motion detected/cleared". | https://www.home-assistant.io/integrations/binary_sensor/ |
| Room occupancy | `binary_sensor`, class `occupancy` ("Shows whether a room or area is occupied"); the ecobee docs mention a room-occupancy binary sensor. | same |
| Someone home | `binary_sensor` class `presence` ("Shows whether someone is home", Home/Away). `person` entities are fed by `device_tracker`s (router, BLE, GPS) with a priority rule. | binary_sensor page; https://www.home-assistant.io/integrations/person/ |
| Door open/closed | `binary_sensor`, class `door` or `garage_door`, with Door opened/closed triggers. | binary_sensor page |
| Doorbell | `event` entity, class `doorbell` ("buttons that are used as a doorbell"), trigger "Doorbell rang". The `event` integration also has class `motion`. | https://www.home-assistant.io/integrations/event/ |
| Kettle, TV | Not a dedicated class. Typically a `switch`/`sensor` (plug power), or `media_player` state. The binary_sensor list includes `running` ("Running / Not running"). | binary_sensor page |
| Distance to tablet | No HA primitive found in the docs read. Only the per-person `device_tracker`/`person` home/away state is documented; I did not review BLE-distance integrations. | person page |
| Timestamps | REST state objects carry `last_changed`, `last_reported`, `last_updated`. | https://developers.home-assistant.io/docs/api/rest/ |
| Push delivery | WebSocket `subscribe_events` (`state_changed`) and `subscribe_entities`; REST `GET /api/stream`, `GET /api/history/period`, `GET /api/logbook`. | https://developers.home-assistant.io/docs/api/websocket/ ; REST page |

Notes:
- The WebSocket docs say that leaving out `event_type` (all events) and "most event types" need an admin.
- Sodalis's Home API notes (0032) say non-admin tokens are not entity-scoped.

## 4. Prior art: context-aware and proactive assistants

All citations are paper abstracts (via Crossref/OpenAlex) or vendor pages. I did not read the full text of any
paper, so figures beyond the abstracts are unverified.

| Work | Relevant facts |
| --- | --- |
| Hudson, Fogarty, Atkeson et al., *Predicting human interruptibility with sensors: a Wizard of Oz feasibility study*, CHI 2003. https://doi.org/10.1145/642611.642657 | Simulated sensors, coded from audio/video, plus random experience-sampling self-reports. "Overall accuracy of several models reaching about 78 %". A model tuned to avoid unwanted interruptions did so for 90 % of its predictions at 75 % overall accuracy. Sample was demographically limited. |
| Fogarty, Hudson, Atkeson et al., *Predicting human interruptibility with sensors*, ACM TOCHI 2005. https://doi.org/10.1145/1057237.1057243 | Simple sensors support models that estimate interruptibility "as well as people do". No complex vision sensors needed. Office workers only; the authors flag a demographically limited sample. |
| Pielot et al., *Didn't you see my message? Predicting attentiveness to mobile instant messages*, CHI 2014. https://doi.org/10.1145/2556288.2556973 | Last-seen/last-online cues are "weak predictors" of attentiveness. Phone features (notification-center interaction, screen activity, proximity sensor, ringer mode) gave 70.6 % accuracy and 81.2 % precision for fast attendance (24 users, two weeks). Relevant to last-interaction recency. (Author attribution from memory; verify against the DOI.) |
| *A Survey of Attention Management Systems in Ubiquitous Computing Environments*, ACM IMWUT 2018. https://doi.org/10.1145/3214261 | Reviews sensing and ML for deferring notifications to opportune moments. Abstract gives no accuracy numbers. |
| *May I Interrupt? Diverging Opinions on Proactive Smart Speakers*, CUI 2021. https://doi.org/10.1145/3469595.3469629 | Online survey of 8 proactive scenarios. Ratings were "surprisingly positive", but participants raised privacy, agency and "undesirable interference with ongoing (social) activities". Controversy noted. |
| *Eliciting Spoken Interruptions to Inform Proactive Speech Agent Design*, CUI 2021. https://doi.org/10.1145/3469595.3469618 | People interrupt sooner when urgent, and use cues from the task being interrupted to time interruptions. Most rarely use "access rituals" to forewarn. |
| *The Role of Trust in Proactive Conversational Assistants*, IEEE Access 2021. https://doi.org/10.1109/ACCESS.2021.3103893 | Study of proactive dialogue's relation to perceived trustworthiness and UX, dependent on user and situational characteristics. |
| INPROSH, *Multimodal-context Interruptibility Dataset for Proactive Services on Smart Speakers at Home*, Scientific Data 2026. https://doi.org/10.1038/s41597-026-07618-0 | 26 participants, three weeks in the wild, 2,830 cases with interruptibility labels plus temporal, spatial and behavioural context and image/sound. The paper states that no earlier public interruptibility dataset focused on home environments. Abstract reports no accuracy. |
| Google, *Look and Talk: Natural Conversations with Google Assistant*, 2022-07-27. https://research.google/blog/look-and-talk-natural-conversations-with-google-assistant/ | Nest Hub Max uses face detection, with "proximity" inferred from face-box size ("Once within 5ft"). It then applies Face Match enrolment, an eye-gaze model and active-speaker detection, then Voice Match, on-device ASR and an intent classifier. The stated aim is to "differentiate intentional interactions from passing glances". The attention requirement is relaxed once the user starts speaking. Eight ML models are used. The post gives no public false-accept/false-reject numbers. Video stays on-device and the feature is opt-in. |
| *The COACH prompting system to assist older adults with dementia through handwashing: An efficacy study*, BMC Geriatrics 2008. https://doi.org/10.1186/1471-2318-8-28 | Autonomous audio/video prompting for dementia. Six participants: 11 % more steps done independently and 60 % fewer caregiver interactions. 78 % of COACH's actions were rated clinically correct. Abstract-only; specific to handwashing. |
| *Passive Infrared Sensor-Based Occupancy Monitoring in Smart Buildings: A Review*, Sensors 2024. https://doi.org/10.3390/s24051533 | PIR is widely used for occupancy. Abstract cites privacy, cost and low processing complexity as reasons. Abstract gives no accuracy figure. |
| *Situated Understanding of Errors in Older Adults' Interactions with Voice Assistants: A Month-Long, In-Home Study*, 2026. https://doi.org/10.1145/3796236 | 15 older adults' homes with smart speakers. Documents conversation breakdowns and error handling with commercial voice assistants. Abstract does not mention sensor-triggered activation. |

### Accuracy and annoyance, as stated in these sources

- **Interruptibility estimates:** the best figures are about 70–80 % accuracy (Hudson 2003; Pielot 2014). Hudson's
  90 % "avoid unwanted interruptions" model cost about 3 points of overall accuracy (75 % vs about 78 %).
- **Population:** all quantified studies are office workers or phone users. None is older adults in a home with
  HA-style sensors. The INPROSH home dataset (2026) reports no accuracy in its abstract.
- **Annoyance:** reported in survey/qualitative terms (privacy, agency, interference with ongoing activity), not as
  false-trigger rates, in *May I Interrupt?*. Pielot reports that last-online cues create social pressure and
  predict poorly.
- **Distance as a signal:** the one shipped example (Look and Talk) pairs proximity with gaze and voice. It does not
  use proximity alone. Its post explicitly designs against "passing glances".
- **Sensor limits:** the PIR review abstract lists privacy, cost and low processing complexity as the draw. Nothing
  in what I read quantifies PIR false-negative rates for still, seated users. HA `occupancy` and `motion` are
  distinct classes, and I did not find HA documentation of hold or timeout behaviour per integration.

## 5. Gaps and uncertainties

- No prior-art paper found that measures sensor-based "about to talk to a smart-home assistant" prediction for
  older adults. T06 (false activations for older adults) may cover related ground.
- Accuracy figures come from abstracts only; full texts were not read (ACM PDFs return HTTP 403 here).
  Semantic Scholar returned HTTP 429. The Hudson 78 % and 75 %/90 % numbers are quoted from the OpenAlex abstract.
- Time-of-day and routine prediction: no source reviewed here quantifies it. The only repo hook is the `home`
  memory observation source, whose behaviour I did not trace.
- Which fake entities the pinned HA image's `demo:` platform creates was inferred from HA `dev` source, not checked
  against tag 2026.9.4 or a running container.
- Distance-to-tablet via BLE/UWB/mmWave in HA was not researched.
- `WAYFIND/` does not exist in this branch's tree; the ticket text was read from the sibling worktree.
- The Pielot 2014 author attribution is from memory; the DOI and title are verified.
