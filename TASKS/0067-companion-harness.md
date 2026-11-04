# 0067 Building and evaluating the companion harness

Status: in progress (implemented and manually verified for household/resident
questions; developer tracing and sensor-reading journeys outstanding)
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

## Delivery sequence

The first four implementation stages are present and the repository gates pass;
stage 5 is partly done (see [Known gaps](#known-gaps)):

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
5. Verify deterministic behavior and repository gates; manually evaluate
   real-model reasoning and latency before refining retrieval.

## Known gaps

Found during the first manual end-to-end check on 2026-11-04 (results in the
[evaluation](../docs/evaluations/companion-harness.md#manual-end-to-end-check)).

### Workflows cannot be inspected or debugged

There is no way to see what was retrieved and sent to the LLM, which tool calls
were made with which arguments and results, or how long each step took. Only
failures are logged, and the public SSE stream deliberately carries only the
terminal outcome (see the
[architecture](../docs/architecture/companion-harness.md#observability-gap)).
This makes wrong or missing answers effectively impossible to diagnose, and it
blocks the rest of the acceptance work below.

Next step: an explicit, opt-in developer mode, off by default, that records a
per-workflow trace:

- the history, system prompt version and steering inputs submitted to Pi;
- each model request/response, including intermediate text and stop reason;
- each tool call with arguments, result (or error/`unavailable`), whether it
  was a repeated call, and duration;
- the terminal outcome and which budget or limit ended the run, if any.

Constraints: traces hold household and resident data, so they must stay out
of the resident UI and public stream, must not be enabled by the standard
example, and must not be persisted beyond the developer's session or sent to
third parties. Output can be developer logs or a dev-only route/event; that
choice and its name are open. Pi's session events are the natural source.
Storing such traces durably, for example in long-term memory, is a possible
later direction and requires
[ADR 0005](../docs/adr/0005-long-term-memory.md) consent, provenance,
retention and deletion; it is not part of this step.

### No actual sensor data obtained

The manual check never returned an actual sensor reading, although the direct
integration test reads the same snapshot without a model. The cause is not
established (the model not calling `read_external_data`, an unreadable or
unmatched reference, a missing readings mount, or withheld stale values; see the
[evaluation](../docs/evaluations/companion-harness.md#manual-end-to-end-check)).
Diagnose it with the developer trace once available, before changing prompts,
tools or the simulator data. The snapshot's readings end on 2026-10-19, so even a
successful read is `stale`; a journey asking for current readings must expect a
qualified answer.

## Remaining acceptance work

Use adaptive investigation, not a fixed sequence of preselected calls:

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

If live appliance-state references are missing, the second journey is a starting
point, not permission to invent mappings. Include ambiguous rooms, unsupported
or unavailable sources, stale observations, and conflicting evidence. Preserve
the actual [import findings](../docs/evaluations/companion-harness.md#results).
Do not modify the separate `home_simulator` project to force a successful demo.

Provisional responsiveness targets on the selected deployment/model:

- Acknowledgment within one second.
- Useful answer within five seconds for ordinary warm-path household questions.

These are unverified goals, not guarantees or cancellation deadlines. Observe
median/p95, model round trips, graph work, and cold/unavailable-source cases.
Longer investigations should remain interruptible and give brief progress
feedback rather than technical tool narration. Compare bounded lookup plus read
with returning more useful evidence during graph retrieval only after measuring
database work and end-to-end/model-round-trip costs.

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

## Planned follow-up: graph checks in CI

Not implemented. Direct graph checks currently run only locally, against the
`home_simulator` Neo4j test container (see the server guide). Snapshot data
stays in that private repository; this public repository holds no simulator
data. A future CI step should:

1. Start the test graph in a dedicated CI job: Neo4j from the pinned upstream
   image, loaded with the `home_simulator` snapshot. Choose how CI obtains the
   private snapshot, for example a private registry image built in
   `home_simulator`, or a read-only checkout credential scoped to that repository.
2. Run `homeGraph.integration.test.ts` with `HOME_GRAPH_TEST_*` and
   `HOME_DATA_TEST_SQLITE`, waiting for readiness and query warm-up (the first
   cold queries took seconds).
3. Keep snapshot contents out of public logs, caches and artifacts. Run only on
   trusted branches, because secrets are unavailable to fork pull requests.
   Never use cloud-provider secrets or model calls (ADR 0006).
4. Record the snapshot's simulator commit (`SOURCE.json`) with the result, and
   update fixed test expectations when the snapshot is refreshed.

Decide whether the job blocks `ci-ok` only after it has run reliably.

## Deferred directions, not scheduled requirements

These preserve design wishes; listing them does not authorize frameworks,
connectors, extra model calls, or expansion of the initial scope.

| Direction | Purpose and condition for revisiting |
| --- | --- |
| Faster interruption handling | Native steering can wait behind slow tools. Add immediate host progress feedback or another interaction path only if measurements warrant it; keep speech stopping distinct from cancellation. |
| Longer-lived Pi sessions | Reduce repeated follow-up retrieval only after resolving context bounds, stale evidence, and history ownership. This does not supply layered memory. |
| Sentence-streamed final speech | Revisit buffering only if latency warrants it; first distinguish speakable final text from intermediate/tool-bearing messages and handle steering races. |
| Appended home-state context | Experiment with an explicitly supplied, sourced/fresh summary, potentially `APPEND_SYSTEM.md` injected through controlled resources. Keep data separate from instructions and fall back to tools. No discovery, generator, refresh policy, or extra model calls selected. |
| Indexes, batching, caching | Optimize after measurement. Separate graph metadata from source contents with freshness/invalidation and future authorization-aware reuse. |
| Additional external-data readers | Add source-specific code for concrete formats/protocols/authentication. A common HTTP contract may enable reuse; no plugin registry assumed. |
| Layered memory integration | Investigate current call sites and ADR 0005 before choosing an interface; preserve consent, provenance, retention, and deletion. No strategy selected for Pi context/compaction. |
| Recurring or event-triggered tasks | Add explicit opt-in triggers, scope/revocation, and a separate lifecycle for an actual journey. Permission to summarize does not imply permission to send/modify. |
| Pi-driven desktop/device actions | Add a typed semantic execution bridge only when needed; preserve desktop-host isolation, exact-action confirmation, cancellation, and honest reporting of committed effects. |
| Personal email/calendar and finer authorization | Add account-specific access and consent for a concrete connector, not ambient cross-app access. Fetch changing contents afresh. |
| Cross-app task execution | Evolve the current focus-scoped action policy explicitly when building the bridge; focus alone must not grant authority, nor may DOM access or blanket authorization. |
| Stronger process isolation | Consider a subprocess or OS isolation if deployment requires it. In-process SDK tools share server permissions/failure domain. |
| Durable runs/restart recovery | Introduce host-owned persistence only for concrete longer tasks under retention/deletion policy; do not enable implicit Pi transcript archives. |
| Resident-visible evidence | Reuse compact tool evidence for on-request/expandable presentation when needed. |

### Deferred capability sketches

- **Email:** "Summarize my unread emails from today and draft a reply to this
  one." Investigate integration with existing email applications and an email
  view in the browser desktop. Desired selectors include latest email, latest
  unread email, latest five emails, or latest five unread emails. Draft creation
  and editing are distinct from sending; sending requires explicit consent.
  Existing fixture Mail actions do not constitute a real connector.
- **Web search:** retrieve and summarize new knowledge through a predefined
  search engine (for example latest news), or open the search in a browser when
  the resident wants further information. No search provider or browser bridge
  is selected.
- **Thuisarts:** preliminary idea only: consult
  [thuisarts.nl](https://www.thuisarts.nl/) for medical-information requests.
  Not a ready design, connector, or approved medical capability.

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
