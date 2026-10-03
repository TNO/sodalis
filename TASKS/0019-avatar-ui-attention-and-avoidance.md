# 0019 Avatar UI attention and avoidance

Status: done
Priority: medium
Subsystem: frontend
Depends on: 0017

## Context

When Sodalis assists with an application, the avatar should be able to look
toward and draw attention to relevant UI controls without obscuring important
content.

The desktop already has or plans semantic UI targets through the Attention
Manager. The presentation system should use this information for both gaze and
placement.

For example, when a user asks how to reply to an email, Sodalis can highlight
the Reply button, have the avatar look toward it, avoid covering the email or
button, and then return the avatar's gaze toward the user.

## Acceptance Criteria

- Applications and the desktop can register important semantic UI regions.
- The presentation controller accepts one or more important/avoid regions.
- The avatar can automatically choose a suitable placement that avoids
  important content.
- Evaluate at least bottom-right, bottom-left, right-side, and left-side
  placements.
- Avoid unnecessary movement while the current placement remains suitable.
- Integrate semantic UI targets with existing avatar gaze support.
- Highlight and gaze can target the same semantic element.
- The avatar returns naturally to user or neutral gaze after guidance.
- Add a demonstration to Avatar Lab or an equivalent developer harness.
- Reduced-motion mode avoids unnecessary avatar movement while preserving
  guidance.

## Implementation Notes

Prefer semantic IDs for attention targets, for example:

```ts
attention.register({
  id: "mail.reply",
  element: replyButton,
  description: "Reply to this email",
});
```

Reuse the existing Attention Manager, presentation controller, and avatar gaze
APIs rather than introducing a parallel target registry.

## Agent Notes

- 2026-10-03: Added after task 0017. Existing task 0018 remains assigned to
  ambient idle-pose variation; this task uses the next available ID.
- 2026-03-17: Confirmed no AttentionManager exists yet. User directed evolving
  the current gaze target registry into semantic attention registration, then
  adding a thin manager for focus, highlight, gaze, and avatar avoidance. Keep
  scrolling, window restoration, and untrusted-app SDK exposure out of scope.
- 2026-03-17: Implemented a semantic `AttentionTargetRegistry`, retaining the
  legacy gaze registry as an adapter. The desktop manager now focuses live UI
  targets for highlight, gaze, and placement avoidance; auto placement scores
  bottom-left/right and centered left/right candidates. Avatar Lab demonstrates
  the complete guidance path. Registration remains internal to trusted Sodalis
  UI code; applications inside Aster are not given a public registration API.
