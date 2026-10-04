# 0027 Structured assistant affect

Status: done
Priority: medium
Subsystem: assistant
Depends on: 0026

## Context

The assistant should not return only plain text.

Sodalis already has semantic avatar affect and gesture capabilities. Connect conversational output to those capabilities using a validated structured response rather than asking the LLM to manipulate animation details.

## Acceptance Criteria

- Define a runtime-validated `AssistantUtterance` schema.
- Include:
  - spoken/display text;
  - semantic affect;
  - optional semantic gesture;
  - interruptibility.
- Validate LLM output before using affect/gesture fields.
- Fall back safely to neutral/warm behavior if structured output is malformed.
- Map affect to the existing `AvatarController`.
- Map gestures to existing semantic gesture APIs.
- Never expose raw ARKit/blendshape values to the LLM.
- Keep caption text and spoken text synchronized appropriately.
- Add tests for valid, malformed, missing, and extreme affect values.

## Implementation Notes

Suggested contract:

```ts
interface AssistantUtterance {
  text: string;

  affect: {
    expression:
      | "neutral"
      | "warm"
      | "happy"
      | "concerned"
      | "sad"
      | "surprised"
      | "reassuring";

    valence: number;
    arousal: number;
    intensity: number;
  };

  gesture?: "nod" | "shake-head" | "acknowledge" | "none";

  interruptible: boolean;
}
```

Clamp numeric values at the protocol boundary.

Prefer restrained expressions. Normal conversation should not cause a new dramatic facial expression for every sentence.

## Agent Notes

- Affect is semantic intent. TalkingHead remains responsible for translating it into actual animation.
