# Companion harness: graph retrieval findings

Status: local graph measurements, a first manual end-to-end check, and a
bounded audit diagnosis recorded; synthetic sensor contracts verified,
actual-source journey blocked and live/latency evaluation pending.
Date: 2026-11-05.

## Summary and recommendation

The first implementation uses bounded entity lookup and neighborhood inspection,
followed by a separate read of a supported external-data reference. Warm graph
queries were inexpensive in the observed small import; cold query planning was
not, motivating startup query-plan warming. Do not infer end-to-end companion
latency or model quality from these graph-only measurements.

A first manual end-to-end conversation through the desktop, with a real model,
answered questions about the home and correctly identified Jo and Robin as the
people living there. It did not obtain any actual sensor reading. Because
retrieved evidence and tool calls cannot yet be inspected, the cause could not
be diagnosed; a developer trace is the prerequisite for further evaluation.

Retain this retrieval shape until representative manual journeys establish a
reason to change it. No comparison yet establishes that combining reads,
batching, adding indexes, or caching produces better resident-facing results.

## Scope

Neo4j graph discovery and the simulator's supported SQLite readings, without
model calls, plus one manual end-to-end check with a real model. Architecture is in
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
| Manual end-to-end: sensor readings | No actual sensor data obtained | The available audit shows no external-data read in the observed workflow; see [Analysis](#analysis) for trace limits |
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
The passing synthetic case is **not actual-source acceptance**. The fresh
checkout supplies no paired, provenance-backed scoped graph/reference and
matching readings snapshot. Existing integration tests require those external
inputs; historical import findings do not establish the exact source resource
or supply its data. Inventing that pair would hide the acceptance blocker.
Task [0070](../../TASKS/0070-complete-sensor-journey.md#bounded-follow-up-to-unblock-acceptance)
keeps a bounded follow-up to obtain approved local evidence and repeat this
boundary with an honest historical/stale result if that is all it supports.

No live external or cloud check ran. Consent has not been given for a live
run; source availability and real-model acceptance remain separately pending.

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
- Synthetic workflow/SQLite fixtures do not supply a provenance-backed
  household source or satisfy actual-source sensor acceptance.

## Open items

[Task 0067](../../TASKS/0067-companion-harness.md) owns manual acceptance,
latency goals, and safe verification policy. Record future consolidated results
here, including hardware, deployment/model, sample counts, and limitations; keep
progress notes in the task.
