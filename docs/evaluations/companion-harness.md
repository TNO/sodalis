# Companion harness: graph retrieval findings

Status: local graph measurements, a first manual end-to-end check, and a
bounded audit diagnosis recorded; synthetic contracts and provenance-backed
offline sensor journey verified. Live-model sensor quality and latency unmeasured.
Date: 2026-11-05.

## Summary and recommendation

The first implementation uses bounded entity lookup and neighborhood inspection,
followed by a separate read of a supported external-data reference. Warm graph
queries were inexpensive in the observed small import; cold query planning was
not, motivating startup query-plan warming. Do not infer end-to-end companion
latency or model quality from these graph-only measurements.

A first manual end-to-end conversation through the desktop, with a real model,
answered questions about the home and correctly identified Jo and Robin as the
people living there. That initial check did not obtain an actual sensor
reading, and its cause remains unconfirmed. On 2026-11-05 the user reported
successful manual connection to the `home_simulator` SQLite database and value
retrieval. This subsequent result confirms database access in the tested setup,
but does not by itself establish the full sensor-journey criteria.
The subsequent offline snapshot workflow now demonstrates task 0070's complete
local journey with actual simulator readings and correlated audit outcomes;
it makes no additional claim about that manual run or real-model quality.

Retain this retrieval shape until representative manual journeys establish a
reason to change it. No comparison yet establishes that combining reads,
batching, adding indexes, or caching produces better resident-facing results.

## Scope

Neo4j graph discovery and the simulator's supported SQLite readings, without
model calls, plus the initial manual end-to-end check with a real model and
a subsequent user-reported database retrieval check, plus network-disabled
scripted workflow tests against an inspected local graph/SQLite snapshot.
Architecture is in
[companion-harness.md](../architecture/companion-harness.md); acceptance work is
tracked in [task 0067](../../TASKS/0067-companion-harness.md).

## Method and hardware

The implementation session measured tool queries against a local Neo4j 5
database with the separate `home_simulator` project's readable import:
122 nodes. It observed cold execution and execution after warm-up.

The original notes do not record hardware, sample counts, exact commands,
individual samples, or percentiles. These are exploratory observations, not a
reproducible benchmark. This report relocates those notes; no new measurements
were performed during documentation consolidation. Setup and direct-integration
test prerequisites are in the
[server guide](../../apps/server/README.md#companion-workflow-pi-harness).

## Results

| Observation | Recorded result | Interpretation |
| --- | --- | --- |
| Warm graph tool queries | Approximately 10-80 ms | Database work only; excludes model round trips and answer delivery |
| First cold query planning | Approximately 5-7 s | Service now warms query plans at startup |
| Manual end-to-end: household and residents | Answered about the home; named Jo and Robin as its residents | Graph discovery works through the full stack (desktop, gateway, AI container, graph network, Neo4j) with a real model |
| Initial manual end-to-end: sensor readings | No actual sensor data obtained | The available audit shows no external-data read in the observed workflow; see [Analysis](#analysis) for trace limits |
| Manual database follow-up (2026-11-05) | User reported successful connection and value retrieval from the `home_simulator` SQLite database | Database access verified in the manual setup; full journey details not reported |
| Offline source-backed workflow (2026-11-05) | Two opt-in runs read the actual paired simulator SQLite snapshot, settle grounded answers and correlate all tool/terminal audit events | Local journey verified; historical/current-relative and stale checks are separate from live/model-quality evidence |
| End-to-end latency | Not measured | No conclusion about response-time goals |

The inspected import also exposed important evidence limitations:

- The temperature/humidity sensor is `INSTALLED_IN` the bathroom
  (*Badkamer*), but one reference is named "Bedroom temperature database
  series". That reference uses an unsupported adapter: a bedroom-temperature
  question encounters conflicting evidence, not an established bedroom reading.
- Simulated readings end on 2026-10-19 and were stale at evaluation time.
- The heater has a configured state (`off`) and no external-data reference;
  its current state cannot be established.
- "bedroom" matches two bedrooms and produces an ambiguous result.

## Manual end-to-end check

On 2026-11-04 the team talked to Sodalis through the desktop with
`COMPANION_HARNESS=pi`, the `home_simulator` Neo4j test container on the shared
graph network, and a real model. This was a qualitative check, not a scored
journey: the provider/model, prompts, number of attempts, and timings were not
recorded, and no transcript was kept.

- Questions about the home produced answers grounded in the graph, and the
  assistant identified Jo and Robin as the people living there.
- No answer contained an actual sensor reading.

Possible causes of the missing readings, none of which could be confirmed:
the model did not call `read_external_data`; the discovered reference was
`readable: false` (wrong adapter, an endpoint not matching
`HOME_DATA_SQLITE_ENDPOINT`, or no `HOME_DATA_SQLITE_FILE` mounted); the
read returned `no_data`/`unavailable`; or the model withheld stale values
(the snapshot's readings end on 2026-10-19). The direct integration test reads
readings from the same snapshot without a model, which suggests the reader
itself works but does not prove the deployed configuration matched it.
Distinguishing these requires the developer trace described in the
[architecture](../architecture/companion-harness.md#observability-gap).

## Analysis

Useful references returned with neighborhoods avoid a separate lookup for every
property, while the subsequent data-read call keeps source resolution under
host control. Only SQLite `readings` are supported; graph references to other
formats do not demonstrate working connectors.

Acceptance should reward clarification, qualified partial answers, and honest
unavailability. Inventing a sensor-to-room mapping or treating configured state
as live data would hide actual source limitations.

### 0068 audit diagnosis

The 0068 audit files contain nine workflow starts and terminal outcomes, with
ten tool selections, dispatches, and results. The only tools in those lifecycle
records are `find_entities` and `inspect_neighborhood`; no
`read_external_data` call was selected or dispatched. One recorded workflow
returned `ok` from entity lookup and neighborhood inspection, then produced a
terminal answer. This places that observed workflow before source access: the
audit does not show a read being rejected by tool validation or policy, nor a
network/authentication/mount failure, empty result, or stale result.

The audit metadata alone does not uniquely associate that workflow with the
original manual sensor question. We did not inspect or repeat household
messages, tool arguments, or result payloads. Therefore the evidence supports
pre-read non-selection in the observed workflow, but does not establish that it
was the original manual check's cause. The separately recorded import findings
above (conflicting sensor/reference location, unsupported source, and stale
simulated readings) are relevant constraints, but are not shown to have been
reached in this workflow.

The deterministic local tool/workflow fixtures passed (25 tests): they
distinguish invalid arguments, supported reads, unsupported or unreachable
sources, empty data, stale data, and workflow tool lifecycle behavior. They do
not identify the exact model-selection decision in the historical manual
conversation or establish live source availability. No live external check was
run. No in-repository retrieval defect was confirmed, so no prompt, tool,
simulator, graph-mapping, or authorization change was made; task 0070 is the
bounded follow-up for a repeatable sensor journey.

### 0070 deterministic sensor journey

Six additional cases in
[workflow.test.ts](../../apps/server/src/assistant/harness/workflow.test.ts)
exercise the public workflow with real Pi sessions, a network-disabled
scripted provider, the existing synthetic graph fixture and the production
SQLite reader. A local database reuses the existing scripted observation;
it is not a simulator export. Reader and tool check times are fixed.
Execution was local on Linux; no hardware or latency benchmark was performed.

| Contract case | Local result |
| --- | --- |
| Recent synthetic observation | Discovery, reference resolution and SQLite read reach a settled answer with source, observation timestamp and fixture-relative freshness |
| Wrong entity | Clarification; no inspection, reference resolution or source read for the wrong room |
| Unreachable configured source | Explicit unavailable result and answer; no substituted reading |
| Empty series | Explicit no-data result; no fabricated value, timestamp or freshness |
| Historical observation | Stale result and qualified answer; no current-temperature claim |
| Conflicting location/reference evidence | Explicit limitation; no invented room mapping or source read |

For every run, assertions join selection, dispatch and result by tool-call
correlation ID within the workflow/session, then join the terminal outcome by
workflow ID. They verify the correlated read outcome (including freshness)
or the absence of all external-read lifecycle events. No audit records,
household contents or tool payloads are reproduced here. Capture is unchanged.

**Recommendation:** retain the existing retrieval and safety boundaries.
No production defect was demonstrated. Scripted answers prove orchestration
and evidence delivery only, not a real model's investigative decisions.
The passing synthetic case is **not actual-source acceptance**. The earlier
fresh-checkout investigation did not locate the external pair. That was a
limit of that investigation, not evidence that the accessible local simulator
project lacked it. The follow-up below supersedes this blocker without
inventing a mapping or requiring a live service.

No live external or cloud check ran during automated implementation.

### Manual database follow-up (2026-11-05)

The user reported that manual testing successfully connected to the
`home_simulator` SQLite database and retrieved values. This supersedes the
earlier database-access blocker in that setup; it does not identify the cause
of the initial failed sensor check or prove a retrieval repair was needed.

The report did not include the question, selected entity/reference, returned
values, observation timestamps, freshness labels, audit correlation, model,
or timings. Those details are not inferred. Full grounded-answer acceptance
for that particular manual run remains unverified; the separate local snapshot
test below supplies repeatable automated evidence, not a reconstruction.
No database contents or audit payloads are copied into this evaluation.
No additional live or cloud check was run by the implementation agent; any
future such run still requires separate explicit consent.

### Local simulator snapshot follow-up (2026-11-05)

**Method/provenance:** inspected the accessible `home_simulator` checkout,
its deterministic generator and existing test-data pair read-only. Source HEAD
was `3f881eb0409ad19882cb76f8b7e004e15ae8ee4f`; the working tree was not clean
and included the untracked snapshot builder `applications/neo4j_testdata.py`.
Consequently HEAD alone is not claimed to reproduce the snapshot.
`SOURCE.json` records scope `cphs:simulation:couple-apartment`, revision
`3f881eb`, build time `2026-11-04T13:06:16+00:00`, 122 nodes and 249 edges.
The builder relativizes graph paths, copies the matching SQLite file and
records provenance; it was inspected, **not executed**. Its SHA-256 was
`24f8b9a1cbb17fb0befc59fd401b94af091ba62ed2a2e5728081e489958af87e`.
The opt-in test pins this inspected pair:

| Local file (not published) | SHA-256 |
| --- | --- |
| `neo4j.json` | `63a07d69b0317c53949e612c4347914e80d5782f82c1179d3f6aa2f37875a5bb` |
| `timeseries.sqlite` | `37510dca058814891b0898c27d9022e04f61bc0f67f3a9425e8014816b6aa0d3` |

`applications/simulator/main.py` generates each reference from its exact
series and sensor owner, calls `external_records` to emit ownership/service
metadata, and stores sensor reports in `readings`. `models/ontology/graph.py`
emits installed location from the deployment binding. The test follows the
exported `DATA_FOR_ENTITY`/`HAS_EXTERNAL_DATA`, `INSTALLED_IN`,
`ACCESSIBLE_THROUGH` and `MEASURES` edges and cross-checks the SQLite owner.
It does not infer a room from a reference name.

**Supported source:** read-only SQLite inspection found four readings series:
`couple-apartment/door/DoorOpen`, `couple-apartment/presence/Presence`,
`couple-apartment/temp-hum/Humidity` and
`couple-apartment/temp-hum/Temperature`. The selected generated reference is
`external/simulation/couple-apartment/temp-hum/Temperature`, resource
`couple-apartment/temp-hum/Temperature`, service adapter `sqlite`, endpoint
`local://simulation/timeseries.sqlite`, table `readings`, periodic reporting,
and degree-Celsius measurement capability. Its owner is the temperature/humidity
sensor installed in the bathroom. The separately configured
`apartment.bedroom.temperature` resource is not a supported readings series;
it must not be substituted or used to claim a bedroom observation.

**Results:** two runs at the public `CompanionWorkflows` seam use a minimal
test-only projection of those actual export edges, the production
`SqliteReadingsReader`, real Pi sessions and a scripted provider with
`allowModelNetwork: false`. An independent read-only SQL oracle establishes
the expected actual numeric observation; assertions check the tool evidence
before returning a grounded terminal answer. The temperature series has 1,472
observations and ends at `2026-10-19T23:59:00+02:00`.

| Fixed check clock | Asserted result |
| --- | --- |
| `2026-10-19T22:01:00Z` | Actual snapshot observation is 2 minutes old, `current` only relative to this historical check; terminal answer labels it a snapshot, not a live room reading |
| `2026-11-05T12:00:00Z` | Same observation is 23,881 minutes old, `stale`; terminal answer retains source, observation time, check time and limitation |

Each run verifies source/unit/value/time/freshness, final answer, exactly one
source read, and selection/dispatch/result correlation by tool-call ID within
its workflow/session, with the terminal outcome joined by workflow ID.
The existing six deterministic cases separately cover wrong entity,
unavailable, empty, stale and conflicting evidence. Targeted
workflow/tools/routes tests: **48 passed**, including both snapshot runs.
Full repository gates: **550 passed, 11 skipped** with local/live opt-ins
disabled; typecheck/build passed. No Python changed.

**Conclusion/limits:** task 0070's local source-backed sensor journey is
complete. This is actual local snapshot retrieval and scripted orchestration,
not live Neo4j authorization verification, a running HTTP service, real-model
investigative quality, or latency acceptance. The snapshot projection is a
test fixture, not a new production graph adapter. No production authorization,
reader, graph mapping, resident behavior or audit capture changed. No simulator
file was modified, no private export/database was copied, and no household
messages or raw audit payloads are published. No network service/cloud call ran.
Reproduction is [documented in the development guide](../development-stack.md#offline-sensor-snapshot-journey).
Manual-run details remain unknown; later live/model checks require separate
consent and are not added as requirements of this ticket.

## Limitations

- Small, local import; performance does not establish scaling behavior.
- No recorded distribution, median/p95, or independent warm/cold repetitions.
- No comparative measurement of alternative retrieval shapes.
- Only one qualitative live-model check (no recorded model, transcript, or
  timings); no provider-compatibility, speech, or end-to-end latency result.
  Scripted-model tests prove lifecycle behavior, not investigative skill.
- The available audit provides tool lifecycle metadata, but the original manual
  sensor question cannot be uniquely matched without inspecting household
  content. Source availability and result freshness were not exercised in that
  historical workflow.
- Stale fixtures and unsupported references constrain answerability.
- Synthetic contract fixtures alone do not establish actual-source acceptance;
  the separate opt-in pair does establish local snapshot acceptance, not live
  graph/model behavior. Private files are intentionally absent from public CI.

## Open items

[Task 0067](../../TASKS/0067-companion-harness.md) owns manual acceptance,
latency goals, and safe verification policy. Record future consolidated results
here, including hardware, deployment/model, sample counts, and limitations; keep
progress notes in the task.
