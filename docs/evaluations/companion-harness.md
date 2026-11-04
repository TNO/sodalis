# Companion harness: graph retrieval findings

Status: local graph measurements and a first manual end-to-end check recorded;
sensor-reading journeys and latency evaluation pending.
Date: 2026-11-04.

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
| Manual end-to-end: sensor readings | No actual sensor data obtained | Cause not diagnosed; see [Analysis](#analysis) |
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

## Limitations

- Small, local import; performance does not establish scaling behavior.
- No recorded distribution, median/p95, or independent warm/cold repetitions.
- No comparative measurement of alternative retrieval shapes.
- Only one qualitative live-model check (no recorded model, transcript, or
  timings); no provider-compatibility, speech, or end-to-end latency result.
  Scripted-model tests prove lifecycle behavior, not investigative skill.
- Workflows cannot yet be traced, so failures cannot be attributed to
  retrieval, source access, or model reasoning.
- Stale fixtures and unsupported references constrain answerability.

## Open items

[Task 0067](../../TASKS/0067-companion-harness.md) owns manual acceptance,
latency goals, and safe verification policy. Record future consolidated results
here, including hardware, deployment/model, sample counts, and limitations; keep
progress notes in the task.
