# 0020 Avatar conversation card

Status: done
Priority: medium
Subsystem: frontend
Depends on: 0017

## Context

When the user actively converses with Sodalis, the avatar should become a more
prominent conversational interface without opening a conventional chatbot
window.

Add a compact accessible conversation card associated with the avatar. The card
will eventually display speech-recognition and assistant output, but this task
should establish the UI independently of production STT/TTS.

## Acceptance Criteria

- Clicking or tapping the avatar can enter conversation presentation mode.
- Show a compact conversation card near the avatar.
- The card supports a user transcript area, assistant caption/text area,
  microphone/listening status, stop/cancel control, and text-input fallback.
- The card can be populated with mock conversation data without STT/TTS.
- Card placement follows avatar docking and remains on-screen.
- The card does not cover the avatar's face.
- Conversation mode increases avatar prominence without taking over the
  desktop.
- Closing conversation mode returns to ambient presentation.
- Keyboard navigation works and screen-reader semantics are provided.
- Text size follows Sodalis accessibility settings.
- Reduced-motion preferences are respected.

## Implementation Notes

Do not create a full chat-history application. The card represents the active
interaction and accessibility transcript. Long conversation history, if
eventually required, should be a separate UI.

## Agent Notes

- 2026-10-03: Added as the accessible, mock-data conversation surface built on
  task 0017's presentation controller.
- The desktop avatar opens an accessible, locally mocked conversation card.
  Speech and assistant-provider integrations remain out of scope.
