# 0070 Complete a sensor journey end to end

Status: complete (provenance-backed local snapshot journey; not live/model-quality acceptance)
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

The original six cases remain **synthetic contract evidence**, not evidence
of a household mapping. The subsequent local follow-up inspected the accessible
`home_simulator` project read-only and added two opt-in workflow cases against
its actual paired graph export and SQLite snapshot. No simulator file was
modified or copied into Sodalis. SHA-256 pins bind the local test to the
inspected pair; ownership, installed location, service, capability/unit and
reading owner must agree before it runs.

The generated temperature series belongs to the bathroom-installed sensor.
It is not the separately configured, unsupported bedroom database reference.
Both local runs obtain an actual numeric observation using the production
SQLite reader, assert it against an independent read-only source oracle,
and settle an answer containing source, observation time and clock-relative
freshness. The snapshot ends at `2026-10-19T23:59:00+02:00`: it is recent only
at the historical fixed check (`2026-10-19T22:01:00Z`, age 2 minutes), and
stale at `2026-11-05T12:00:00Z` (age 23,881 minutes). Both runs assert
per-tool selection/dispatch/result and workflow-terminal audit correlation.

Consolidated results and limitations are in the
[evaluation](../docs/evaluations/companion-harness.md#0070-deterministic-sensor-journey).
On 2026-11-05 the user reported successful manual database connection and
value retrieval using the `home_simulator` SQLite database. See the
[manual follow-up](../docs/evaluations/companion-harness.md#manual-database-follow-up-2026-11-05)
for the reported result and limits. This supersedes the database-access
blocker, but does not establish all journey acceptance criteria.
No live external or cloud check ran. Scripted orchestration is not real-model
quality evidence, and this result does not complete dependent tickets.

### Acceptance evidence and remaining limits

1. Local source provenance, supported resource, grounded answer and correlated
   audit are now demonstrated by the opt-in snapshot workflow. The
   [evaluation](../docs/evaluations/companion-harness.md#local-simulator-snapshot-follow-up-2026-11-05)
   records provenance and its limits; the
   [local reproduction procedure](../docs/development-stack.md#offline-sensor-snapshot-journey)
   needs files only, not a running service or credentials.
2. The user's manual retrieval report still supplies no timestamp, freshness,
   terminal-answer or audit details. The local automated result does not
   retroactively establish those facts or explain the initial failure.
3. Live Neo4j/HTTP/cloud and real-model checks were not required or performed.
   Any later such run needs separate consent (and cloud-provider selection
   checks). They are not a blocker to this ticket's deterministic local scope.

## Agent Notes

- 2026-11-05 follow-up: Created fresh `ticket/0070-complete-sensor-journey`
  worktree at the exact requested integration base
  `b8c9afb12c8bd31ffc14fa3b4127d7c2e6bb1946`. Loaded TDD; the first targeted
  test failed on the absent snapshot loader, then passed with the read-only
  projection and real source. Targeted workflow/tools/routes: 48 passed,
  including both local snapshot runs and the existing six contract cases.
- Full `pnpm test`: 550 passed, 11 skipped (including the two opt-in snapshot
  cases in CI mode); `pnpm typecheck` and `pnpm build` passed. Live graph/STT
  settings were explicitly removed; no `.env` or overlay was loaded.
  The first full run exposed missing `three` dependencies in the new worktree;
  restored all workspace dependencies with the frozen lockfile and reran.
  Build retains the existing chunk-size advisory. No Python changed.
- Merged the integration tip before completion (already up to date at
  `b8c9afb12c8bd31ffc14fa3b4127d7c2e6bb1946`). Also verified CI ignores an
  explicitly configured nonexistent snapshot directory: 21 passed, 2 skipped.
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
