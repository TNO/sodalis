# 0040 Designing multi-house Home Assistant connectivity

Status: open
Priority: medium
Subsystem: home
Depends on: 0038

## Context

Sodalis may eventually need to connect to Home Assistant installations for
approximately 500 houses. This is not part of the simulator or initial
single-instance integration. Define a safe architecture before implementing
fleet connectivity.

## Acceptance Criteria

- Document the multi-house tenant and home identity model.
- Define secure onboarding, credential storage/rotation, revocation, and
  isolation between homes.
- Compare viable connectivity models for customer-hosted Home Assistant
  instances, including network reachability, availability, and operational
  ownership.
- Define per-house authorization, auditability, rate limiting, and failure
  handling.
- Address what data may flow to memory or an explicitly selected remote LLM.
- Identify privacy, security, and operational risks and record unresolved
  decisions.
- Do not implement multi-house connectivity or expand the single-instance
  adapter in this task.

## Implementation Notes

- Depends on the single-instance adapter only as a working baseline; the
  design must not assume customers expose Home Assistant directly to the
  public internet.

## Agent Notes

- Fleet-scale connectivity is deliberately deferred while the first Home
  Assistant service uses a local simulator.
