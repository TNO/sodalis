# 0033 Creating the semantic app integration SDK

Status: done
Priority: high
Subsystem: frontend
Depends on: 0028, 0029

## Context

Sodalis should make it straightforward for developers to add browser-desktop
applications that the avatar can explain and the assistant can control.
Current actions are registered centrally and must not become arbitrary DOM
automation. The first version is for developer-authored Sodalis integrations,
not user-imported third-party action plugins.

## Acceptance Criteria

- Provide a documented, typed integration surface for app identity, semantic
  action descriptors, argument schemas, risk, and action handlers.
- Validate action IDs, arguments, availability, and risk in Sodalis-owned code.
- Keep arbitrary DOM access and generic script execution unavailable to the
  LLM.
- Let apps register/unregister semantic UI targets through the existing
  attention system so the avatar can highlight and gaze at visible controls.
- Offer actions from the focused app plus explicitly global actions for each
  turn; do not expose all installed app actions by default.
- Preserve existing exact-action confirmation enforcement.
- Let app handlers call Sodalis-owned APIs without exposing backend engine
  URLs or credentials.
- Make a first-party app integration addable through a small, documented
  package/registration pattern.
- Bundle browser app UI into the desktop image by default; allow a separate
  backend service only when an app needs one.
- Keep user-importable third-party action code and its trust/permission model
  out of scope.
- Include tests and a small example integration.

## Implementation Notes

- Build on `AssistantActionRuntime` and `DesktopHost`.
- The current Aster host intentionally excludes web and custom apps from its
  trusted built-in app listing; do not bypass that boundary.
- Same-origin API routing is established in task `0034`.

## Agent Notes

- Only developer-authored, first-party integrations are in scope initially.
- 2026-10-04 Copilot: Added a typed first-party app registry with focused/global
  action scoping, validation via the assistant runtime, target cleanup, and
  same-origin Home API methods. Wired a bundled Sample Notes panel without
  changing Aster's iframe or host trust boundary. Verified 5 SDK behavior
  tests, 1 new desktop focus test, SDK/desktop typechecks. Apps needing a
  backend must add a Sodalis-owned service and gateway route.
