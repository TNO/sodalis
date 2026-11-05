# 0068 Inspect a conversation through a persistent developer text audit

Status: open
Priority: high
Subsystem: assistant
Depends on: none

## Context

Task [0067](0067-companion-harness.md) needs evidence to distinguish harness
selection, tool dispatch, retrieval, and answer failures. The current workflow
does not expose intermediate activity. This is a local developer diagnostic,
not resident-visible evidence, durable assistant memory, or a compliance log.

## Acceptance Criteria

- Add an explicitly opt-in developer audit, disabled by default, with a
  production guard that rejects attempts to enable it.
- Write both a chronological human-readable transcript and structured JSONL
  from the same event stream under the repository-root `logs/` directory.
  Keep the directory git-ignored and bind-mounted into the AI container so the
  files survive container shutdown.
- Record user and assistant messages; model and tool lifecycle events; tool
  names, arguments, and results; harness policy/validation decisions; and
  timestamps, durations, correlation IDs, and terminal outcomes. Distinguish
  tool selection, dispatch, and result.
- Include only provider-supported reasoning summaries and harness metadata;
  never promise or expose hidden chain-of-thought. Always redact credentials.
  For spoken input, record only the resulting text transcript—never audio bytes,
  recordings, or audio artifacts.
- Keep audit data out of resident UI, public SSE, external uploads, and durable
  assistant memory. The developer is responsible for manually deleting these
  potentially sensitive household logs. Do not add automatic expiry/deletion,
  a quota/capacity manager, special warning UI, or a retention service.
- Report ordinary write errors through standard server error logging rather
  than silently swallowing them; add no resident-facing runtime behavior or
  compliance-grade guarantees.
- Add deterministic mock-event behavior tests for opt-in/production guarding,
  lifecycle correlation and outcomes, credential redaction, text-only speech
  capture that emits no audio bytes/recordings/artifacts, separation from
  resident transport and memory, and bind-mount persistence across container
  shutdown.
- Update the architecture documentation with current behavior and the audit
  contract.

## Implementation Notes

The root `logs/` path is repository-relative, not the operating-system
`/logs`. Keep the audit separate from the memory system: manual audit deletion
does not satisfy or change memory consent, retention, or deletion policy.
