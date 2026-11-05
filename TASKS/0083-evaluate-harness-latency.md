# 0083 Evaluate harness latency and execution budgets

Status: open
Priority: low
Subsystem: assistant
Depends on: 0070

## Context

Latency and execution-budget claims should follow a completed sensor journey
and reproducible evidence, not provisional timing targets. The eventual
evaluation belongs in
[`docs/evaluations/`](../docs/evaluations/README.md), following its README.

## Acceptance Criteria

- Define a reproducible evaluation with workload, environment, sample counts,
  and conditions; report p50/p95 when meaningful and explain when they are not.
- Measure relevant end-to-end and component timing and assess budgets without
  inventing target thresholds.
- Separate deterministic local/mock results from any live external result.
  Obtain explicit user consent for each live external check; do not run without
  it. Cloud-provider commands also follow the repository's provider-selection
  checks.
- Record the consolidated analysis in `docs/evaluations/` and link it from
  this task. Keep only progress notes here.
- Evaluation scripts do not need tests under ADR 0006; do not add tests solely
  for benchmark scripts.

## Implementation Notes

No latency threshold is approved by this task. It is not a prerequisite for
the sensor journey or one-path convergence.
