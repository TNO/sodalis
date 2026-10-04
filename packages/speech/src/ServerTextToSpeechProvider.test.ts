import { describe, expect, it, vi } from "vitest";
import { ServerTextToSpeechProvider } from "./ServerTextToSpeechProvider.js";
import type { SpeechRequest } from "./index.js";

const AUDIO_MIME_TYPE =
  "audio/pcm;rate=22050;bits=16;channels=1;endianness=little";

const request: SpeechRequest = {
  sessionId: "turn-1",
  speechId: "reply-1",
  text: "Goedemorgen.",
  language: "nl-NL",
  voice: "nl_BE-nathalie-medium",
};

function createResponse(
  body: ReadableStream<Uint8Array>,
  sessionId = request.sessionId,
  speechId = request.speechId,
): Response {
  return new Response(body, {
    headers: {
      "content-type": AUDIO_MIME_TYPE,
      "x-sodalis-session-id": sessionId,
      "x-sodalis-speech-id": speechId,
    },
  });
}

describe("ServerTextToSpeechProvider", () => {
  it("streams audio chunks tagged with the request IDs and sequence", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        createResponse(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.enqueue(new Uint8Array([3, 4]));
              controller.close();
            },
          }),
        ),
    );
    const provider = new ServerTextToSpeechProvider({ fetch: fetcher });
    const chunks = [];

    for await (const chunk of provider.speak(request, new AbortController().signal)) {
      chunks.push(chunk);
    }

    expect(provider.capabilities).toMatchObject({
      runtime: "server",
      languages: ["nl-NL", "nl-BE"],
      streamingAudio: true,
      phonemeTiming: false,
      visemeTiming: false,
    });
    expect(chunks).toEqual([
      {
        type: "audio",
        data: new Uint8Array([1, 2]),
        mimeType: AUDIO_MIME_TYPE,
        sessionId: "turn-1",
        speechId: "reply-1",
        sequence: 0,
      },
      {
        type: "audio",
        data: new Uint8Array([3, 4]),
        mimeType: AUDIO_MIME_TYPE,
        sessionId: "turn-1",
        speechId: "reply-1",
        sequence: 1,
      },
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      sessionId: "turn-1",
      speechId: "reply-1",
      text: "Goedemorgen.",
      language: "nl-NL",
      voice: "nl_BE-nathalie-medium",
    });
  });

  it("reports request-to-first-audio latency once", async () => {
    const now = vi
      .fn()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(37)
      .mockReturnValueOnce(52);
    const onLatency = vi.fn();
    const provider = new ServerTextToSpeechProvider({
      fetch: async () =>
        createResponse(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.enqueue(new Uint8Array([3, 4]));
              controller.close();
            },
          }),
        ),
      now,
      onLatency,
    });

    for await (const _chunk of provider.speak(
      request,
      new AbortController().signal,
    )) {
      // Drain the stream to exercise both chunks.
    }

    expect(onLatency).toHaveBeenCalledOnce();
    expect(onLatency).toHaveBeenCalledWith({
      sessionId: "turn-1",
      speechId: "reply-1",
      type: "first-audio",
      latencyMs: 27,
    });
  });

  it("reassembles PCM samples split across transport chunks", async () => {
    const provider = new ServerTextToSpeechProvider({
      fetch: async () =>
        createResponse(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1]));
              controller.enqueue(new Uint8Array([2, 3, 4]));
              controller.close();
            },
          }),
        ),
    });
    const chunks = [];

    for await (const chunk of provider.speak(
      request,
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      type: "audio",
      data: new Uint8Array([1, 2, 3, 4]),
      sessionId: "turn-1",
      speechId: "reply-1",
      sequence: 0,
    });
  });

  it("rejects a response that belongs to a stale speech ID", async () => {
    const provider = new ServerTextToSpeechProvider({
      fetch: async () =>
        createResponse(
          new ReadableStream<Uint8Array>(),
          request.sessionId,
          "old-reply",
        ),
    });

    await expect(async () => {
      for await (const _chunk of provider.speak(
        request,
        new AbortController().signal,
      )) {
        // This response must be rejected before audio is consumed.
      }
    }).rejects.toThrow("mismatched speech ID");
  });

  it("cancels a pending response read when the caller aborts", async () => {
    const abortController = new AbortController();
    let cancelled = false;
    let markReadStarted: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    const provider = new ServerTextToSpeechProvider({
      fetch: async () =>
        createResponse(
          new ReadableStream<Uint8Array>({
            pull() {
              markReadStarted?.();
              return new Promise<void>(() => undefined);
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
    });
    const consuming = (async () => {
      for await (const _chunk of provider.speak(
        request,
        abortController.signal,
      )) {
        // Keep reading until cancellation rejects the stream.
      }
    })();

    await readStarted;
    abortController.abort(new Error("Speech cancelled."));

    await expect(consuming).rejects.toThrow("Speech cancelled.");
    expect(cancelled).toBe(true);
  });
});
