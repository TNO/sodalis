# 0015 Building in-app avatar selection

Status: open
Priority: medium
Subsystem: frontend
Depends on: 0014
Owner: Copilot
Agent: unassigned

## Context

The user wants to preview and choose among several avatars inside Sodalis,
rather than choosing a model only from a written list. This task starts after
the native Sodalis avatar collection in 0014 is available as local,
profile-validated assets.
The two-option prototype switch and its local persistence are tracked in
[0055](./0055-add-male-thuiszorg-avatar-option.md). Reuse that behavior where
appropriate; this task remains responsible for the full gallery.

## Acceptance Criteria

- The desktop exposes a clear, accessible in-app gallery for the available
  profile-validated avatar assets.
- A user can preview and select an avatar; each option shows its name and
  applicable license/attribution.
- The production chooser includes only assets approved for the intended
  distribution model. The CC BY-NC TalkingHead sample from 0013 is excluded
  unless its non-commercial restriction is explicitly acceptable.
- Invalid or unavailable assets do not prevent the rest of the desktop from
  working.
- Decide whether the full gallery retains the prototype's device-local
  selection behavior or needs a different persistence policy.

## Implementation Notes

- Depends on the native collection produced by 0014; 0013's non-commercial
  sample is not a prerequisite.
- Keep the model catalogue separate from the renderer so adding a model does
  not require changing the selection UI.

## Agent Notes

- 2026-10-03: Created to track the user's preference for an in-app visual
  chooser and multiple model options. No picker UI or persistence behavior has
  been implemented.
