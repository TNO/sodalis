# 0017 Avatar presentation controller

Status: done
Priority: high
Subsystem: frontend
Depends on: 0016

## Context

Sodalis needs a layer above `AvatarController` that decides how the companion
is presented on the desktop.

`AvatarController` answers:

"What is the avatar doing?"

It owns expression, gaze, visemes, gestures, and behavioral state.

The new `AvatarPresentationController` answers:

"Where and how should the companion appear?"

It owns position, scale, framing, visibility, docking, and presentation mode.

Keeping these concerns separate prevents TalkingHead and avatar animation
code from becoming coupled to desktop layout.

## Acceptance Criteria

- Introduce an `AvatarPresentationController` or equivalent abstraction.
- Support presentation modes:
  - `ambient`
  - `conversation`
  - `assisting`
  - `notification`
- Support show/hide.
- Support left/right/automatic docking.
- Support avatar scale and framing changes.
- Keep presentation state independent from `AvatarController` animation state.
- Transition between presentation modes smoothly.
- Do not continuously resize the avatar between individual
  listening/thinking/speaking states.
- Persist the user's preferred dock/visibility setting.
- Respect reduced-motion settings when changing presentation.
- Add Avatar Lab controls for exercising presentation modes.

## Implementation Notes

Suggested initial interface:

```ts
interface AvatarPresentationController {
  setMode(
    mode:
      | "ambient"
      | "conversation"
      | "assisting"
      | "notification"
  ): void;

  setDock(position: "left" | "right" | "auto"): void;

  setImportantRegions(regions: DOMRect[]): void;

  show(): void;
  hide(): void;
}
```

## Agent Notes

- 2026-10-03: Recorded as a follow-up to 0016. Not yet implemented.
- 2026-10-03: Started the presentation controller and Avatar Lab integration.
  The controller will own presentation mode, dock/visibility preferences,
  scale, framing, important-region collision scoring, and motion-aware CSS
  transitions; it will not subscribe to AvatarController behavioral states.
- 2026-10-03: Implemented the presentation controller, Avatar Lab controls,
  window-aware automatic docking, persisted dock/visibility preferences, and
  reduced-motion transitions. Validated with the full workspace tests/build
  and browser interaction; no significant code-review issues found.
