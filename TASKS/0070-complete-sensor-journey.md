# 0070 Complete a sensor journey end to end

Status: in progress (manual database retrieval verified; full journey evidence pending)
Priority: high
Subsystem: assistant
Depends on: 0069

## Context

The first household/resident journey has been manually verified. Subsequent
manual testing confirmed database connectivity and successful value retrieval;
full sensor-journey evidence remains pending. This is the first accepted end-to-end data
journey after diagnosing the retrieval gap; preserve the existing graph
household/resident behavior rather than rewriting the knowledge graph.

Task 0069's sanitized audit evidence shows an observed workflow terminating
after `find_entities` and `inspect_neighborhood`, without selecting or
dispatching `read_external_data`. It does not uniquely identify the historical
manual sensor question or establish source availability. Use this task to
exercise the full read path with deterministic local data; do not treat an
absent live-source check as a successful reading.

## Acceptance Criteria

- Complete a representative question by resolving the intended graph entity,
  discovering its supported external-data reference, obtaining an actual
  reading from that source, and giving a grounded answer.
- State the reading's source, timestamp, and freshness truthfully. A known
  historical snapshot may support a stale reading, but must never be presented
  as fresh or current.
- Cover relevant wrong-entity, unavailable, empty, stale, and conflicting
  evidence cases with honest outcomes; do not invent sensor mappings or
  readings.
- Make the journey repeatable with deterministic local fixtures. Report local
  fixture results separately from any real-source result. Every live external
  check requires separate explicit user consent for that run; absent consent
  or access remains an explicit blocker, not a successful live check. Cloud
  provider commands also follow the repository's provider-selection checks.
- For each deterministic run, use the developer audit's existing correlation
  metadata to associate tool selection, dispatch, and result/terminal-outcome
  events with that same workflow, including whether `read_external_data` was
  selected, dispatched, and what outcome it produced. Follow 0068's audit
  contract and safeguards; do not broaden capture or copy sensitive household
  content, tool payloads, or audit records into task/evaluation documentation.
- Update the architecture and task evidence without changing unrelated graph
  household/resident behavior.

## Implementation Notes

Keep acceptance grounded in what the configured source actually returns. No
latency threshold is selected by this task.

## Outcome and verification limits

The public workflow boundary now exercises discovery, reference resolution and
the real SQLite reader with a deterministic local database and scripted Pi
model. Six cases cover a recent fixture observation, wrong entity,
unreachable source, empty series, stale observation and conflicting evidence.
Each run checks selection/dispatch/result correlation by tool-call ID within
its workflow/session, and joins the terminal outcome by workflow ID. Cases
that clarify or report conflict assert that no external read was selected,
dispatched or performed. Audit capture and production policies are unchanged.

This is **synthetic contract evidence, not an actual-source passing journey**.
The database reuses the existing scripted workflow's synthetic reference and
observation. It does not establish a household mapping or reading. At the time
of automated verification, no paired, provenance-backed simulator
graph/reference and readings snapshot was supplied in the fresh checkout;
the existing direct integration test requires external
Neo4j settings and a matching SQLite file. Recorded import findings alone do
not supply that file or its exact supported series metadata. Inventing these
to mark acceptance complete would be misleading.

Consolidated results and limitations are in the
[evaluation](../docs/evaluations/companion-harness.md#0070-deterministic-sensor-journey).
On 2026-11-05 the user reported successful manual database connection and
value retrieval using the `home_simulator` SQLite database. See the
[manual follow-up](../docs/evaluations/companion-harness.md#manual-database-follow-up-2026-11-05)
for the reported result and limits. This supersedes the database-access
blocker, but does not establish all journey acceptance criteria.
No additional live external or cloud check was run by the implementation
agent. Neither this ticket nor dependent acceptance is marked complete.

### Remaining acceptance evidence

1. Record sanitized provenance for the manually tested pair: the scoped graph entity,
   location/ownership and supported reference metadata, plus its matching
   SQLite readings snapshot. Establish the exact reference resource from that
   evidence, not a reference name or guessed room mapping. Do not copy private
   data into this public repository.
2. Record whether the manual journey established discovery, reference resolution,
   a grounded answer with source, timestamp and freshness, and correlated audit
   outcomes. These details were not supplied with the successful retrieval
   report. If historical, report stale evidence honestly; if conflicting, retain
   an honest limitation rather than relabeling the source.
3. Keep any later real-source/model check separate. Obtain explicit consent
   for that run and check provider selection in `.env` and any overlay before
   running it. Record only sanitized conclusions here and in the evaluation.

## Agent Notes

- 2026-11-05: Confirmed integration base
  `49708c60f253e2fc1308e96494f09b3b099136d6`; created the fresh
  `implementation/0070-complete-sensor-journey` branch/worktree.
- Loaded TDD before implementation. The first journey failed before the test
  harness accepted the real reader/fixed clock, then passed after that wiring.
  Further cases characterize existing behavior; no production fix was needed.
- Targeted `workflow.test.ts`, `tools.test.ts` and `routes.test.ts`: 46 passed,
  including the six new journey cases.
- `pnpm test`: 550 passed, 9 skipped across root/workspace suites.
  Ran with `CI=1` and live graph/Azure STT test settings removed; no `.env`
  or overlay was selected. No live test ran.
- `pnpm typecheck` and `pnpm build`: passed. Build retains the existing
  large-chunk advisory. No Python changed, so `pnpm test:python` was not needed.
- Fresh-worktree missing dependencies were restored with the frozen lockfile.
  An initial parallel gate run hit unrelated memory test timeouts; the full
  test gate passed when rerun without competing build/typecheck processes.
