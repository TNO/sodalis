# 0018 Avatar ambient idle pose

Status: open
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
