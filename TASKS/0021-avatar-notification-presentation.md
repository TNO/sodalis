# 0021 Avatar notification presentation

Status: done
Priority: low
Subsystem: frontend
Depends on: 0017

## Context

The avatar can eventually provide a friendlier notification surface than
conventional desktop notification popups. Notifications should not cause the
avatar to speak spontaneously by default; normal behavior should be subtle and
user-controlled.

For example, when a new message arrives from Anne, the avatar can show a small
notification indicator. When activated, Sodalis may say or display, "You have
a new message from Anne. Would you like me to read it?"

## Acceptance Criteria

- Add a subtle avatar notification indicator or badge.
- Support the `notification` presentation mode.
- Represent multiple notifications without creating multiple popup windows.
- Activating the indicator opens a concise notification summary.
- Notifications can expose semantic actions such as read, dismiss, and open
  related app.
- Notifications do not automatically speak by default.
- Important information is available visually and accessibly.
- The avatar returns to ambient mode after notification interaction.
- Notification behavior does not interfere with an active conversation.
- Include mock notifications for testing.

## Implementation Notes

Do not build the complete notification-policy engine in this task. Keep source
information semantic so future integrations can provide:

```ts
{
  source: "mail",
  type: "new-message",
  title: "New message from Anne",
  actions: ["read", "open", "dismiss"]
}
```

## Agent Notes

- 2026-10-03: Added as a user-controlled notification presentation surface
  built on task 0017; automatic speech remains out of scope.
- 2026-10-03: Implemented accessible notification actions, app opening, and
  responsive panel positioning; workspace tests, typecheck, build, and browser
  checks passed.
