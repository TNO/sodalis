# 0029 Splitting speech and AI into Sodalis services

Status: done
Priority: high
Subsystem: backend
Depends on: 0028

## Context

The current Hono server hosts speech and assistant routes in one process. The
browser should continue to use Sodalis-owned APIs, but speech and AI need
independent service lifecycles and provider configuration. The AI service is
the durable Sodalis boundary for LLM access and the future memory module; the
browser must never connect directly to Ollama, vLLM, Azure, or another model
provider.

## Acceptance Criteria

- Provide independently runnable Sodalis speech and AI API services.
- Preserve the current Sodalis speech and assistant request/response contracts
  or document and test any necessary versioned changes.
- Keep provider credentials and implementation URLs on the server side.
- Keep cancellation, streaming, session IDs, and error behavior intact.
- Add health/readiness checks and tests for each service independently.
- Keep AI generation behind a Sodalis-owned interface that can host memory
  without changing the browser API.
- Do not implement persistent memory in this task.
- Document service responsibilities and internal service communication.

## Implementation Notes

- The existing Hono routes and process entrypoint are in `apps/server`.
- Avoid making the desktop aware of engine-specific APIs or Compose DNS names.
- The same-origin gateway and Compose wiring are in task `0034`.

## Agent Notes

- Keep the browser-facing contracts stable while splitting the deployment
  boundary; provider replacement is handled by `0030` and `0031`.
- 2026-10-04 Copilot: Split process entrypoints and local proxy by API path,
  preserving request/stream contracts. Added independent liveness/readiness
  checks (readiness reflects configuration, not upstream reachability). Verified
  2 new health tests and server/desktop typechecks; no memory persistence.
