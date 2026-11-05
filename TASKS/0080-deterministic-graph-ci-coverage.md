# 0080 Decide and wire deterministic graph integration CI coverage

Status: open
Priority: medium
Subsystem: assistant
Depends on: none

## Context

The harness has direct graph integration checks that currently run locally;
their long-term CI role is undecided. Choose a reproducible gate without
introducing live provider dependencies, cloud credentials, or public exposure
of private simulator data.

## Acceptance Criteria

- Decide whether the deterministic graph integration check belongs in CI or
  remains a documented local gate, and record the rationale and exact
  reproducible invocation.
- Wire the selected gate at its chosen local or CI boundary, using mock/local
  services and deterministic test data. CI must not require cloud credentials,
  make live external-provider calls, or run live tests.
- Keep private simulator data and credentials out of this public repository,
  CI logs, and artifacts. Do not add cloud-provider secrets to GitHub Actions.
- Follow repository CI conventions, including the `ci-ok` check where the
  decision makes this gate part of CI.
- Update the architecture and task with the selected coverage and verification
  boundary.

## Implementation Notes

This is an independent test-infrastructure decision; it is not a prerequisite
for the sensor journey or any external live check.
