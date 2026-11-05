# 0069 Diagnose and repair harness data retrieval

Status: done
Priority: high
Subsystem: assistant
Depends on: 0068

## Context

The first manual harness check answered household questions but obtained no
sensor reading. The cause is unknown; see the recorded
[evaluation evidence](../docs/evaluations/companion-harness.md#manual-end-to-end-check).
Use the audit from [0068](0068-persistent-developer-audit.md) to identify the
failure before changing retrieval behavior.

## Acceptance Criteria

- Use repeatable local fixtures and audit evidence to distinguish whether a
  reading was not selected, rejected by harness validation/policy, unavailable
  because of network/authentication/mount access, empty, or stale. Do not
  present any of these as the established cause before evidence supports it.
- Make a bounded repair for a confirmed harness defect and add a regression
  test at the relevant public behavior boundary.
- Do not bypass existing authorization, graph scope, source allowlists, or
  input validation to make a read succeed.
- If the confirmed blocker is outside this repository or needs unavailable
  external access, document the evidence and create a bounded follow-up rather
  than claiming successful repair or changing unrelated graph data.
- Keep deterministic local/mock verification separate from any live external
  check. Every live external check requires separate explicit user consent for
  that run; without it, do not run the check and record the remaining
  verification blocker. Cloud-provider commands also follow the repository's
  provider-selection checks.
- Update the architecture with the confirmed cause, repair, and verification
  limits; keep measured findings in the evaluation.

## Implementation Notes

This task is diagnosis and a bounded repair, not permission to change prompts,
tools, simulator data, or graph mappings without evidence.

## Outcome

The 0068 audit's sanitized lifecycle metadata records no selection or dispatch
of `read_external_data`; the observed tool lifecycles stop at
`find_entities`/`inspect_neighborhood`. This supports pre-read non-selection
for an observed workflow, but the metadata cannot uniquely match it to the
historical manual sensor question. No validation/policy rejection, source
unavailability, empty result, or stale result is evidenced for that workflow.

The deterministic local tool/workflow tests passed (25 tests), covering
validation, supported reads, unsupported/unreachable sources, empty data,
staleness, and workflow lifecycle. No live external check was run, and no
in-repository defect was confirmed; therefore no behavior change or regression
test was warranted. The bounded follow-up is [0070](0070-complete-sensor-journey.md):
reproduce the complete journey locally, and keep any live-source verification
separate and consent-gated.
