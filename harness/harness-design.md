# Harness for Sodalis

The design and implementation notes from the 2026-11-04 companion-harness
session have been consolidated into the repository's existing documentation
structure. This page preserves the original entry point; update the
authoritative documents below rather than appending new design notes here.

| Read for | Authoritative document |
| --- | --- |
| Decision, rationale, authority boundary, consequences | [ADR 0007: Companion harness](../docs/adr/0007-companion-harness.md) |
| Current components, tools, lifecycle, diagrams, behavior-test map | [Companion architecture](../docs/architecture/companion-harness.md) |
| Illustrative graph references and unsupported connectors | [Graph examples](../docs/architecture/companion-graph-examples.md) |
| Configuration, routes, startup, direct integration checks | [Server guide](../apps/server/README.md#companion-workflow-pi-harness) |
| Recorded graph measurements and their limitations | [Evaluation evidence](../docs/evaluations/companion-harness.md) |
| Remaining acceptance, unverified targets, deferred directions | [Task 0067](../TASKS/0067-companion-harness.md) |

The first read-only implementation is present and opt-in. It has no desktop
action bridge or long-term memory integration; the existing turn path retains
its behavior. Real-model reasoning and end-to-end latency evaluation are still
pending. Pi embedding is not an operating-system sandbox.
