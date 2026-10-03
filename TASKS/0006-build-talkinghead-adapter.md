# 0006 Building the TalkingHead adapter

Status: done
Priority: high
Subsystem: avatar
Depends on: 0005
Owner: Copilot
Agent: current session

## Context

The avatar package must isolate `@met4citizen/talkinghead` behind the public
`AvatarController` contract and use its avatar-only, external-renderer, and
external-update-loop integration.

## Acceptance Criteria

- Only the adapter imports TalkingHead.
- The adapter validates and loads/unloads assets, maps the state/mood/viseme
  behavior supported by TalkingHead, and updates from an externally supplied
  delta.
- Semantic gestures are completed in 0008; registered/world gaze resolution is
  completed in 0009.
- No second TalkingHead-owned RAF/render loop is active.
- Load cancellation, unload/dispose, and adapter behavior are unit-testable
  without production speech or an LLM.

## Implementation Notes

- Use the exact compatible version selected in 0004.
- Handle aborts and load failures explicitly; do not silently fall back to a
  success-shaped avatar.

## Agent Notes

- Pinned `@met4citizen/talkinghead` 1.7.0 and Three.js 0.180.0 in
  `packages/avatar/package.json`; installed `@types/three` 0.180.0 for strict
  TypeScript integration.
- Added the internal subpath
  `packages/avatar/src/adapters/TalkingHeadAvatarController.ts` and a narrow
  local type declaration. The root controller contract remains independent of
  Three.js and TalkingHead.
- The adapter validates metadata, creates TalkingHead with Sodalis's scene and
  camera in muted avatar-only mode, maps state/mood/viseme controls, and calls
  `animate(deltaSeconds * 1000)` from the owner loop. `load`, `unload`, and
  `dispose` clean resources; abort races dispose immediately and also clean up
  a late loader completion.
- Added adapter tests for external scene ownership, millisecond delta
  conversion, affect/viseme mapping, unload, malformed assets, and cancellation.
- Validation: 17 avatar tests passed, avatar strict typecheck/build passed,
  and the pinned npm module imported successfully.
- TalkingHead 1.7.0 labels avatar-only mode experimental. Gesture animation
  and UI/world gaze resolution are deferred to 0008–0009, as planned.
