# 0015 Building in-app avatar selection

Status: open
Priority: medium
Subsystem: frontend
Depends on: 0013, 0014
Owner: Copilot
Agent: unassigned

## Context

The user wants to preview and choose among several avatars inside Sodalis,
rather than choosing a model only from a written list. This task starts after
the TalkingHead brunette and an MPFB-authored avatar are available as local,
profile-validated assets.

## Acceptance Criteria

- The desktop exposes a clear, accessible in-app gallery for the available
  profile-validated avatar assets.
- A user can preview and select an avatar; each option shows its name and
  applicable license/attribution.
- Invalid or unavailable assets do not prevent the rest of the desktop from
  working.
- Decide whether selection persists across reloads before implementing storage.

## Implementation Notes

- Depends on the locally available assets produced by 0013 and 0014.
- Keep the model catalogue separate from the renderer so adding a model does
  not require changing the selection UI.

## Agent Notes

- 2026-10-03: Created to track the user's preference for an in-app visual
  chooser and multiple model options. No picker UI or persistence behavior has
  been implemented.
