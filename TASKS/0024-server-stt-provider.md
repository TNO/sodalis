# 0024 Server STT provider

Status: done
Priority: high
Subsystem: speech
Depends on: 0022, 0023

## Context

Implement the first production-capable speech recognition path.

Start with server-side STT so Sodalis does not require a moderate tablet to perform neural speech recognition locally.

Dutch (`nl-NL`) is a first-class target language.

## Acceptance Criteria

- Implement `ServerSTTProvider` using the contracts from 0022.
- Stream captured speech/audio to the Sodalis server.
- Return partial transcripts when supported.
- Return a final transcript.
- Display partial/final text in the conversation card.
- Support Dutch.
- Support cancellation.
- Reject stale results from cancelled/replaced sessions.
- Handle server disconnects and recognition failures gracefully.
- Record:
  - speech-end to first partial latency;
  - speech-end to final transcript latency.
- Keep the STT engine behind the server provider abstraction.
- Add integration tests using deterministic/mocked server responses.
- Document the selected STT engine and rationale.

## Implementation Notes

Do not expose engine-specific result objects outside `ServerSTTProvider`.

Normalized output should resemble:

```ts
type STTEvent =
  | {
      type: "partial";
      text: string;
      confidence?: number;
    }
  | {
      type: "final";
      text: string;
      confidence?: number;
    };
```

If the chosen engine does not provide meaningful confidence values, omit them rather than inventing values.

Keep browser-local STT as a future provider.

## Agent Notes

- Evaluate recognition quality with normal conversational Dutch rather than only English test phrases.
- Also evaluate the lightweight Dutch-capable Whistle model requested by the user:
  https://huggingface.co/Cactus-Compute/whistle
- Implemented a self-hosted Whisper.cpp adapter behind the Hono speech API.
- The provider advertises final-only output (`partialResults: false`); first-partial latency is therefore not applicable. Speech-end-to-final latency is reported by the provider.
- The Whistle and Whisper.cpp comparison used two synthetic Dutch utterances and is documented in `apps/server/README.md`; it is not a broad accuracy benchmark.
