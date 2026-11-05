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

The approved development-diagnosis target is an explicitly opt-in,
development-only text audit written locally under the git-ignored
repository-root `logs/` directory; it is implemented as described in the
[current architecture](../architecture/companion-harness.md#observability-gap)
and [server guide](../../apps/server/README.md#development-only-audit)
([task 0068](../../TASKS/0068-persistent-developer-audit.md)).
The host bind-mounts that directory into the AI container so audit files survive
container shutdown. A chronological human transcript and structured JSONL come
from the same event stream. This narrow diagnostic persistence is not a Pi
session archive, resident-visible evidence, external upload, or durable
assistant memory. The audit is disabled by default, must be rejected in
production, captures spoken input only as text, and never records audio bytes
or artifacts. Developers manually delete sensitive logs; no automatic
retention, capacity manager, or special warning UI is introduced.

The harness is the planned sole supported assistant execution path, but only
after confirmed desktop actions, consent-governed memory, and steering and
interruption behavior reach parity. Until that work is complete, the current
turn and workflow paths remain separate; this decision does not claim that
convergence is implemented.

## Consequences

- The model can adapt its investigation to returned evidence instead of following
  preselected calls. Host code, not prompt compliance, enforces execution bounds.
- SDK embedding shares the server's permissions and failure domain. It is
  **not an operating-system sandbox**; stronger process isolation is deferred.
- The developer audit deliberately changes the earlier constraint against
  persisting beyond a developer session for a tightly scoped local diagnostic.
  Household content in logs may be sensitive; manual audit deletion does not
  satisfy or change memory consent, retention, or deletion policy.
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
