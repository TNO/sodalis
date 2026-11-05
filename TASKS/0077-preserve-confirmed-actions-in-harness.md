# 0077 Preserve confirmed desktop actions through the harness

Status: open
Priority: medium
Subsystem: assistant
Depends on: none

## Context

The existing turn path supports trusted semantic desktop actions and
confirmation policy; the workflow path does not. Make this capability available
through the eventual harness path by reusing existing policy and execution
boundaries, not by exposing the desktop to the model.

## Acceptance Criteria

- Reuse the trusted action definitions, semantic host capability, authorization
  checks, and exact-action confirmation behavior documented in
  [task 0028](0028-assistant-app-actions.md) and
  [task 0044](0044-propose-confirmed-actions.md).
- Add harness action capability only through explicit host-approved semantic
  interfaces. Preserve the `packages/desktop-host` boundary and do not expose
  Aster's DOM, imported app content, arbitrary globals, or blanket desktop
  access.
- Preserve confirmation for consequential actions, bound to the exact action
  and arguments; the model cannot approve or claim completion on the user's
  behalf.
- Add behavior tests at public interfaces for authorization, confirmation,
  cancellation/result handling, and refusal of unsupported capabilities.
- Update architecture documentation with the implemented capability and
  verification evidence.

## Implementation Notes

This task does not expand the set of action definitions or weaken existing
policy. Existing task 0044 remains separately tracked.
