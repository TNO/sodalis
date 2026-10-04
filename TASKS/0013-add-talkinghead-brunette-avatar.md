# 0013 Adding the TalkingHead brunette avatar

Status: done
Priority: high
Subsystem: frontend
Depends on: none
Owner: Copilot
Agent: current session

## Context

The user selected TalkingHead's female brunette example avatar for the initial
visible model. The asset is distributed under CC BY-NC 4.0, separate from the
MIT-licensed Sodalis application. Keep its attribution and license with the
asset, and do not imply that commercial use is permitted.

## Acceptance Criteria

- The exact TalkingHead v1.7.0 `brunette.glb` is stored as a local desktop
  asset with source, version, checksum, and license recorded.
- The actual model is checked with the Sodalis GLB validator; compatibility
  issues are fixed or reported without claiming unsupported profile compliance.
- The selected avatar loads in the desktop viewer and has a useful initial
  frame; failures remain visible and retryable.
- Tests cover the default asset configuration and user-visible loading/failure
  behavior.

## Implementation Notes

- Source: https://github.com/met4citizen/TalkingHead/blob/v1.7.0/avatars/brunette.glb
- Asset license: CC BY-NC 4.0; preserve the separate asset license and
  attribution. The app's MIT license does not override the model's terms.
- User-facing product scope is limited to this model. A multi-avatar chooser is
  tracked separately in 0015.

## Agent Notes

- 2026-10-03: Started after the user selected the TalkingHead female brunette.
  The initial repository had no avatar model.
- 2026-10-03: Added the unchanged v1.7.0 GLB, CC BY-NC notice, visible source
  and license links, and default loading with a retryable failure state. The
  GLB passes every Sodalis validator check: 52 ARKit shapes, 15 visemes,
  13,317 triangles, 10 estimated draw calls, and 1024px maximum texture.
  Browser verification shows the model rendered in the desktop. Disabling
  TalkingHead's unused default `lipsyncModules` stopped its dynamic locale
  module 404s; restore locale loading with proper bundling when speech is
  integrated. Typecheck, all 51 tests, production build, and diff checks pass.
- 2026-10-03: Follow-up: hide the model's `Wolf3D_Glasses` node through avatar
  metadata at load time; leave the bundled GLB unchanged. Added controller and
  metadata tests and verified the avatar still loads in the desktop without
  glasses.
