# 0016 Avatar desktop overlay

Status: done
Priority: high
Subsystem: frontend
Depends on: none

## Context

The avatar currently renders inside the Avatar Lab sidebar. That is useful for
development but should not be the normal Sodalis presentation.

The production avatar should become a persistent companion rendered directly
over the Aster/Sodalis desktop. It should visually appear to inhabit the
desktop rather than live inside a rectangular widget or application window.

Avatar Lab must remain available as a developer tool.

This task only establishes the desktop avatar surface. Presentation modes,
intelligent positioning, conversation UI, and notifications are separate
tasks.

## Acceptance Criteria

- Add a persistent avatar layer to the Sodalis desktop shell.
- Render the existing Three.js/TalkingHead avatar in this layer.
- Use a transparent Three.js canvas so there is no visible rectangular avatar
  background.
- Default placement is near the bottom-right of the usable desktop.
- Default framing is approximately upper-body rather than only the head.
- Avatar remains loaded when applications/windows are opened or closed.
- Desktop resize updates the avatar surface without reloading the GLB.
- Avatar does not unintentionally block pointer interaction with desktop/apps
  outside its interactive area.
- Existing Avatar Lab continues to work.
- Avatar failure does not prevent normal desktop operation.
- Existing avatar lifecycle/disposal behavior remains correct.
- The avatar's visible floor aligns with the live taskbar or desktop edge, with
  a small overlap and no fixed-resolution position.
- Gaze diagnostics are hidden by default and can be enabled from Avatar Lab.
- Preserve the existing avatar dimensions and pass pointer events through the
  transparent overlay.

## Implementation Notes

- The avatar belongs to the desktop shell, not an Aster application window.
- Continue using the existing Sodalis-owned Three.js scene/render loop and
  `AvatarController`.
- Do not create a second TalkingHead renderer or animation loop.
- Prefer a desktop overlay/layer with explicit z-order.
- Keep the avatar presentation implementation separate from animation
  behavior.
- Avatar Lab may control the same avatar instance through development controls
  rather than owning a separate production renderer.
- Avoid hard-coded pixel positioning that only works at the current desktop
  size.
- Ensure touch and pointer-event behavior is tested.
- Measure the same-origin Aster taskbar from its iframe and update on desktop
  resize, taskbar resize, or dock-position changes.

## Agent Notes

- 2026-10-03: Recorded from the requested desktop-overlay brief. Not yet
  implemented.
- 2026-10-03: Started implementing the persistent desktop overlay, preserving
  the existing AvatarViewport scene lifecycle and Avatar Lab integration.
- 2026-10-03: Added `DesktopAvatarOverlay` over the Aster workspace and moved
  the horizontal scroll behavior into an inner scrollport so the avatar stays
  anchored during mobile panning. The overlay reuses `AvatarViewport` and its
  existing scene; Avatar Lab receives that same scene through `onScene`.
  Responsive sizing keeps the transparent upper-body view above the taskbar,
  pointer events pass through to Aster, and only the retry control is
  interactive. Covered persistence, failure isolation, resize without another
  avatar load, app open/close, and mobile panning in tests and browser checks.
  Workspace tests, typecheck, and production build passed.
- 2026-10-03: Reopened for follow-up presentation refinements: measure Aster's
  live taskbar geometry for avatar floor placement, move it slightly closer to
  the right edge without changing its size, and make gaze diagnostics opt-in.
  The current controller only provides head motion and gestures; neutral body
  idle variation is tracked separately in 0018.
- 2026-10-03: Measured the live taskbar inside the Aster iframe and aligned the
  avatar viewport floor to its inward edge with a 3px visual overlap. The
  measurement responds to resizing and dock geometry, while preserving the
  existing avatar dimensions and keeping the overlay pointer-transparent.
  Added the Avatar Lab gaze-diagnostic toggle (off by default) and recorded
  neutral ambient body animation as task 0018. Desktop tests, typecheck, build,
  and browser checks passed.
