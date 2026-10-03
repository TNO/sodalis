# 0018 Avatar ambient idle pose

Status: done
Priority: medium
Subsystem: frontend
Depends on: 0016

## Context

The current TalkingHead brunette's resting pose is visually distinctive, while
the runtime only supplies head motion and gesture playback. Sodalis needs a
more neutral ambient posture for a persistent desktop companion.

## Acceptance Criteria

- Provide a relaxed default idle posture that is suitable for prolonged
  desktop presence.
- Add subtle breathing and occasional, low-amplitude body or weight movement.
- Keep the current hand-on-hip pose available only as an occasional variation
  if the chosen avatar asset and animation pipeline support it.
- Respect reduced-motion settings and do not interfere with speaking, gaze, or
  explicit gestures.
- Preserve a single avatar render loop and dispose any animation resources with
  the existing avatar lifecycle.

## Implementation Notes

- Inspect the available avatar asset's rig and animations before selecting a
  procedural or authored animation approach.
- Keep presentation placement and window awareness in tasks 0017 and later;
  this task is only about the avatar's ambient body pose.

## Agent Notes

- 2026-10-03: Recorded during the 0016 refinement. `TalkingHeadAvatarController`
  currently handles idle head gaze/motion and explicit gestures, but exposes no
  neutral body-pose or weight-shift system. Implementing one would be a separate
  animation/asset change, so it is intentionally deferred.
- 2026-03-17: Started implementation after inspecting
  `apps/desktop/public/avatars/talkinghead-brunette.glb`: it has a 67-joint
  skeleton, no authored animation clips, and facial-only morph targets. Keep
  the avatar's relaxed bind pose; add procedural torso/hip motion through the
  existing controller update loop. Do not invent an occasional hand-on-hip
  animation unsupported by this asset.
- 2026-03-17: Added low-amplitude breathing and slow hip/torso sway in the
  controller's existing update loop. Motion is idle-only, restores the captured
  bind pose for reduced motion, speech, gestures, unload, and failed loads, and
  does not write to head/gaze joints. Avatar package tests (51) and typecheck
  pass. The asset has no hand-on-hip animation to retain as a variation.
