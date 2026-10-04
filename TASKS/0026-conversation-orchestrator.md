# 0026 Conversation orchestrator

Status: done
Priority: high
Subsystem: assistant
Depends on: 0024, 0025

## Context

Sodalis now needs a central conversation orchestrator connecting speech, application context, LLM inference, avatar behavior, captions, and cancellation.

The orchestrator coordinates providers but must not contain provider-specific STT/TTS/LLM implementations.

Long-term memory is explicitly out of scope.

## Acceptance Criteria

- Implement a conversation/session orchestrator.
- Introduce an LLM provider abstraction.
- Implement at least one configurable server-side LLM provider.
- Support conversation states approximately:
  - `idle`
  - `listening`
  - `transcribing`
  - `thinking`
  - `speaking`
  - `interrupted`
  - `error`
- Connect these states to:
  - conversation card;
  - avatar state;
  - STT;
  - LLM;
  - TTS.
- Include current trusted-app semantic context when appropriate.
- Support streaming LLM output.
- Support cancellation of an active turn.
- Ensure stale asynchronous events cannot mutate the current turn.
- Maintain short working conversation history.
- Do not implement long-term memory/RAG.
- Recover gracefully from provider failures.
- Add state-machine/unit tests.

## Implementation Notes

Conceptually:

```text
VAD
 |
STT
 |
 v
ConversationOrchestrator
 |
 +---- current AppContext
 |
 +---- short working history
 |
 v
LLMProvider
 |
 v
assistant response
 |
 v
TTS
```

Use explicit turn/session IDs.

The orchestrator owns coordination, not presentation details.

Do not place business logic inside UI components.

## Agent Notes

- Keep working memory intentionally small and explicit. Persistent personal memory is a later milestone.
