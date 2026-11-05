# 0067 Building and evaluating the companion harness

Status: in progress (current two-path implementation; approved follow-up
acceptance remains in tasks 0068–0083)
Priority: high
Subsystem: assistant
Depends on: 0031

## Context

The 2026-11-04 design session selected a small Pi-based read-only investigation
loop. [ADR 0007](../docs/adr/0007-companion-harness.md) records the decision;
the [architecture](../docs/architecture/companion-harness.md) describes the
current implementation. Setup is in the
[server guide](../apps/server/README.md#companion-workflow-pi-harness).
The [evaluation](../docs/evaluations/companion-harness.md) is the authoritative
home for measured findings, not these progress notes.

The current implementation and its verification remain distinct from the
approved target. The numbered
[acceptance roadmap](README.md#companion-investigation-harness) breaks the
remaining work into independent, verifiable slices; this umbrella remains open.

## Current implementation

The first four implementation stages are present:

1. Define lifecycle/event contracts and scripted-model behavior checks.
2. Embed explicit Pi sessions, prompt/tools, limits, and event translation,
   without a desktop mutation bridge.
3. Implement bounded graph reads and required external-data readers, checked
   against actual schema/sources without LLM calls.
4. Wire desktop workflow transport, speech-stop versus steering, and race
   handling, preserving the existing turn path.
   Compose now configures the embedded harness and optional read-only readings
   mount; the desktop discovers server mode without a special image build.
   Neo4j remains explicitly configured and externally managed. The AI
   container joins the Compose `graph` network (Docker name: the stack
   prefix), which the Neo4j container is expected to join as `neo4j`; the
   Sodalis stack creates it and must start first. See the
   [stack guide](../docs/development-stack.md#shared-graph-network).

The implementation notes record deterministic behavior checks and repository
gates passing at that time. The accepted follow-up verification and remaining
evidence are tracked by tasks 0068–0083; that historical result does not imply
current acceptance.

## Known gaps

Found during the first manual end-to-end check on 2026-11-04 (results in the
[evaluation](../docs/evaluations/companion-harness.md#manual-end-to-end-check)).

### Developer audit is not implemented

There is no way to follow retrieved evidence, model/tool events, and their
relation to an outcome, or to inspect tool arguments, results, and step
durations. Only failures are logged, and the public SSE stream deliberately
carries only the terminal outcome (see the
[architecture](../docs/architecture/companion-harness.md#observability-gap)).
This makes wrong or missing answers effectively impossible to diagnose, and it
blocks the accepted diagnosis and sensor journey.

Approved follow-up [0068](0068-persistent-developer-audit.md) adds an
explicitly opt-in, development-only audit, disabled by default and rejected in
production. It writes a chronological human transcript and structured JSONL
from the same event stream to the git-ignored repository-root `logs/` directory,
bind-mounted into the AI container so files survive container shutdown. It
captures messages; model/tool lifecycle; tool names, arguments, and results;
harness policy/validation decisions; timestamps, durations, correlation IDs,
and terminal outcomes; and distinguishes tool selection, dispatch, and result.
Only provider-supported reasoning summaries and harness metadata are allowed,
never hidden chain-of-thought. Credentials are redacted; spoken input is
captured only as text, never as audio bytes, recordings, or artifacts.

The audit remains outside resident UI, public SSE, external uploads, and
durable assistant memory. Developers manually delete sensitive household logs.
No automatic expiry/deletion, capacity manager, warning UI, or retention
service is planned. Ordinary write errors use standard server error logging.
This intentionally supersedes the earlier planned "not persisted beyond the
developer's session" constraint for local diagnostic logs only. It adds no
resident-facing behavior or compliance-grade guarantees and does not change
memory consent, retention, or deletion. Tests use deterministic mock events.

### No actual sensor data obtained

The manual check never returned an actual sensor reading. The cause is
unknown; possible causes recorded in the
[evaluation](../docs/evaluations/companion-harness.md#manual-end-to-end-check)
are not findings. Task [0069](0069-diagnose-harness-data-retrieval.md) requires
evidence before a bounded repair. Then task
[0070](0070-complete-sensor-journey.md) requires a repeatable, grounded journey
that reports the actual source, timestamp, and freshness. A known historical
snapshot may return stale data; it must not be presented as fresh.

## Accepted sensor journey

Task [0070](0070-complete-sensor-journey.md) accepts an adaptive investigation,
not a fixed sequence of preselected calls:

1. Ask about a room, device, or measurement.
2. Find candidates and inspect relevant relationships.
3. Discover supported external-data references.
4. Read observations and reason over the returned evidence.
5. Give a short grounded answer, clarification, or honest limitation.

Representative questions:

- "Which devices could make the living room warmer, and what are they doing
  now?" Establish capability/location and current state only where graph and
  sources support them. Configured state is not a live reading.
- "What is the temperature in the bedroom?" Discover the sensor and reference,
  then obtain a timestamped observation only if the actual evidence permits it.

If live appliance-state references are missing, a question is not permission to
invent mappings. Cover wrong entity, unavailable, empty, stale, and conflicting
evidence where relevant; preserve the actual
[import findings](../docs/evaluations/companion-harness.md#results). Do not
modify the separate `home_simulator` project to force a successful demo.

Earlier draft timings of a one-second acknowledgment and five-second answer
were not accepted as targets. No response-time threshold is currently
approved. Task [0083](0083-evaluate-harness-latency.md) may establish
measurements, including p50/p95 when meaningful, without inventing a target.
Any live external check requires separate explicit user consent for that run;
cloud-provider commands also follow the repository's provider-selection checks.

## Verification policy

- Scripted model substitutes exercise the real loop with predetermined
  responses: tool-result-driven continuation, answer gating, evidence/errors,
  steering-before/after-settlement, duplicates, cancellation, limits, and speech
  onset while an answer is in transit.
- Direct Neo4j/data-reader integration checks validate schema, formats, and
  query performance without model calls. Test prerequisites and source/test
  links are in the server guide and architecture.
- Scripted behavior does not prove a real model chooses good investigative
  steps. Real-model reasoning and end-to-end responsiveness need manual
  evaluation; do not automate paid retry-until-pass or optimization loops.
- Automated tests and CI must not make paid model calls. Any agent-run cloud
  check requires explicit consent for that run and an agreed call/output limit;
  inspect selected providers first. Runtime investigation limits still apply.
- For workspace-code changes run `pnpm test`, `pnpm typecheck`, and `pnpm build`
  under the repository's existing gates. Documentation relocation is not a
  claim that implementation gates or manual acceptance have passed.

## Deterministic graph integration coverage

Direct graph checks currently run only locally, against the test container in
the separate `home_simulator` project; no simulator data is stored here. Task
[0080](0080-deterministic-graph-ci-coverage.md) decides whether this check
remains a reproducible local gate or moves into CI, then wires the selected
deterministic gate. CI must use mock/local services, require no cloud
credentials, and never run live provider tests or expose private simulator
data.

## Accepted roadmap and explicit deferrals

The approved roadmap is broken into bounded tasks, not authorization for
unselected capabilities:

| Scope | Tracking |
| --- | --- |
| Local development audit, evidence-based retrieval diagnosis, first sensor journey | [0068](0068-persistent-developer-audit.md), [0069](0069-diagnose-harness-data-retrieval.md), [0070](0070-complete-sensor-journey.md) |
| Read-only email and calendar provider/access decisions, followed by refined implementation tasks | [0071](0071-decide-read-only-email-access.md) → [0072](0072-complete-read-only-email-journey.md); [0073](0073-decide-read-only-calendar-access.md) → [0074](0074-complete-read-only-calendar-journey.md) |
| Existing consent-governed memory and context ownership | [0075](0075-decide-harness-memory-and-context.md) → [0076](0076-preserve-memory-in-harness.md); reuse existing work in tasks 0039 and 0045–0053 |
| Confirmed actions and steering/interruption parity | [0077](0077-preserve-confirmed-actions-in-harness.md); [0078](0078-verify-harness-steering.md), after 0070 |
| Retire the duplicate turn path after feature parity | [0079](0079-converge-on-harness-execution-path.md); depends on 0070, 0076, 0077, and 0078, not on this umbrella |
| Deterministic graph check placement | [0080](0080-deterministic-graph-ci-coverage.md) |
| Decisions only: longer-lived work; resident-visible progress/evidence | [0081](0081-decide-longer-lived-work.md); [0082](0082-decide-resident-progress-and-evidence.md) |
| Reproducible latency and budget evaluation | [0083](0083-evaluate-harness-latency.md), after 0070 |

Email and calendar scope is read-only: relevant recent messages summarized
with sender/date/source, and appointments in a requested period with timezone
and source. No sending, drafting, calendar writes, or hidden cross-source
synthesis is approved. Account authorization must come from the connector, not
graph endpoint metadata. Each provider and access model remains undecided until
its decision task is complete.

The following remain explicit non-goals unless separately decided and tracked:

- Web search, browser bridges, and medical-information connectors such as
  Thuisarts; none is a selected or approved capability.
- Sentence-streamed final speech, appended home-state context, indexing,
  batching, caching, or other retrieval optimization without measurements.
- Stronger operating-system/process isolation; the embedded SDK continues to
  share the server's permissions and failure domain.
- Durable runs, restart recovery, or recurring/event-triggered work. Task 0081
  is a decision only; no such implementation is scheduled.
- Resident-visible progress/evidence UI. Task 0082 is a decision only and is
  separate from sensitive developer audit logs.

No live external check is authorized by these tickets. Obtain separate,
explicit user consent before each such run; commands that can send data to a
cloud provider also require checking the selected providers and applicable
configuration.

## Agent Notes

- 2026-11-04: Consolidated the design-session document into ADR 0007,
  architecture, graph examples, evaluation evidence, and this task. The first
  implementation is present; manual real-model evaluation remains outstanding.
  No new measurements or code verification are claimed by this documentation move.
- 2026-11-04: Added a local Neo4j test container with a fixed, path-free
  snapshot of the simulator import, in the `home_simulator` repository rather
  than here, so no simulator data enters this public repository. It is a test
  aid and does not change simulator behavior or force a demo. The direct graph
  checks passed 5/5 against it. CI use is the planned follow-up above.
- 2026-11-04: Manual end-to-end check through the desktop with a real model:
  household questions were answered from the graph and Jo and Robin were
  identified as residents; no actual sensor data was obtained. Recorded both
  as [known gaps](#known-gaps). Documented the shared `graph` network and the
  verified start order (Sodalis first; Neo4j's external network declaration
  fails otherwise). Code cleanup: removed unused exports and the unused harness
  `close()` wrapper. `pnpm test`, `pnpm typecheck` and `pnpm build` pass; the
  direct graph test was not rerun.
- `home_simulator`'s `docs/neo4j-test-container.md` still says "Either stack
  can start first"; that is only true once the Sodalis stack has created the
  network. Fix it in that repository.
