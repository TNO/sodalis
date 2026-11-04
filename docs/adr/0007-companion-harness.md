# ADR 0007: Embed Pi behind a host-controlled companion boundary

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

Household questions can require successive graph and external-data reads, with
each result informing the next lookup. The existing turn path generates one
response and can execute a desktop action, but does not feed that action's
result into another model iteration. The companion needs an adaptive tool loop,
not a fixed investigation sequence or a resident-facing coding agent.

The design favors a lightweight, customizable, open-source runtime with an
existing tool ecosystem and replaceable models. Responsiveness and isolation
remain requirements to evaluate, not properties established by choosing an SDK.

## Decision

Embed [Pi](https://pi.dev/)'s TypeScript SDK in the existing assistant server.
Pi manages the model/tool loop; Sodalis owns executable capabilities, validation,
limits, cancellation, and resident-answer delivery. Supply the companion prompt
and tools explicitly, without default shell/file tools or automatic discovery
of settings, credentials, instructions, extensions, or packages.

Start with read-only graph investigation and configured external-data readers.
Graph metadata and model output cannot authorize arbitrary URLs, files, SQL,
Cypher, or new capabilities. Configured home reads need no additional per-call
dialog; this does not authorize personal-account access or consequential
mutations. Existing consent and exact-action confirmations remain intact.

Use temporary in-memory sessions per foreground workflow, without an automatic
Pi transcript archive. Add a dedicated opt-in workflow transport alongside the
existing turn path rather than forcing steering and cancellation into its
one-generation text stream. Keep Pi-specific mechanics internal to the server
harness; do not introduce a generic workflow framework or plugin registry.

## Consequences

- The model can adapt its investigation to returned evidence instead of following
  preselected calls. Host code, not prompt compliance, enforces execution bounds.
- SDK embedding shares the server's permissions and failure domain. It is
  **not an operating-system sandbox**; stronger process isolation is deferred.
- A new workflow may repeat earlier retrieval. Longer-lived sessions, durable
  runs, caching, and additional readers require concrete journeys or measurements.
- The workflow path currently has neither desktop actions nor long-term memory.
  The existing turn path retains both its action and optional-memory behavior.
  Pi working context is not a replacement for layered memory.
- [ADR 0003](0003-trusted-desktop-boundary.md) still governs Aster/desktop access;
  [ADR 0005](0005-long-term-memory.md) still governs memory consent, provenance,
  retention, and deletion. This decision does not supersede either.

See the [current architecture](../architecture/companion-harness.md), the
[evaluation evidence](../evaluations/companion-harness.md), and
[task 0067](../../TASKS/0067-companion-harness.md) for implementation,
verification gaps, and deferred directions.
