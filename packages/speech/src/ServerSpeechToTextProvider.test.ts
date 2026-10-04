import { describe, expect, it, vi } from "vitest";
import { ServerSpeechToTextProvider } from "./ServerSpeechToTextProvider.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ServerSpeechToTextProvider", () => {
  it("streams audio to the server and emits a normalized final transcript", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ sessionId: "turn-1" }, 201))
      .mockResolvedValueOnce(jsonResponse({ acceptedBytes: 3 }))
      .mockResolvedValueOnce(jsonResponse({ text: "Waar is de afspraak?" }));
    const onLatency = vi.fn();
    const provider = new ServerSpeechToTextProvider({
      baseUrl: "http://localhost:3000/api/",
      fetch: fetcher,
      now: () => 175,
      onLatency,
    });
    const session = await provider.createSession({
      sessionId: "turn-1",
      language: "nl-NL",
      signal: new AbortController().signal,
    });

    await session.writeAudio({
      data: Uint8Array.from([1, 2, 3]),
      mimeType: "audio/webm",
    });
    await session.finish(100);
    const events = [];
    for await (const event of session.events) events.push(event);

    expect(fetcher.mock.calls.map(([url, init]) => [String(url), init?.method]))
      .toEqual([
        ["http://localhost:3000/api/speech/stt/sessions", "POST"],
        [
          "http://localhost:3000/api/speech/stt/sessions/turn-1/audio",
          "POST",
        ],
        [
          "http://localhost:3000/api/speech/stt/sessions/turn-1/finish",
          "POST",
        ],
      ]);
    expect(provider.capabilities.partialResults).toBe(false);
    expect(events).toEqual([
      {
        type: "final",
        text: "Waar is de afspraak?",
        sessionId: "turn-1",
      },
    ]);
    expect(onLatency).toHaveBeenCalledWith({
      sessionId: "turn-1",
      type: "final",
      latencyMs: 75,
    });
  });

  it("cancels the remote session and rejects stale writes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ sessionId: "turn-cancel" }, 201))
      .mockResolvedValueOnce(jsonResponse({ cancelled: true }));
    const controller = new AbortController();
    const session = await new ServerSpeechToTextProvider({
      fetch: fetcher,
    }).createSession({
      sessionId: "turn-cancel",
      language: "nl-NL",
      signal: controller.signal,
    });
    const events = session.events[Symbol.asyncIterator]();

    controller.abort();
    await expect(events.next()).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      session.writeAudio({
        data: Uint8Array.from([1]),
        mimeType: "audio/webm",
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("deletes a session created while its start response is being aborted", async () => {
    let resolveStart: ((response: Response) => void) | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveStart = resolve;
          }),
      )
      .mockResolvedValueOnce(jsonResponse({ cancelled: true }));
    const controller = new AbortController();
    const creating = new ServerSpeechToTextProvider({
      fetch: fetcher,
    }).createSession({
      sessionId: "turn-create-race",
      language: "nl-NL",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(resolveStart).toBeDefined());
    controller.abort();
    resolveStart?.(jsonResponse({ sessionId: "turn-create-race" }, 201));

    await expect(creating).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("does not emit a final result if the session was cancelled during finish", async () => {
    let resolveFinish: ((response: Response) => void) | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ sessionId: "turn-stale" }, 201))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFinish = resolve;
          }),
      )
      .mockResolvedValueOnce(jsonResponse({ cancelled: true }));
    const controller = new AbortController();
    const session = await new ServerSpeechToTextProvider({
      fetch: fetcher,
    }).createSession({
      sessionId: "turn-stale",
      language: "nl-NL",
      signal: controller.signal,
    });
    const finishing = session.finish();
    await vi.waitFor(() => expect(resolveFinish).toBeDefined());
    controller.abort();
    resolveFinish?.(jsonResponse({ text: "This must be discarded." }));

    await expect(finishing).rejects.toMatchObject({ name: "AbortError" });
    await expect(session.events[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("surfaces server disconnects as explicit provider errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ sessionId: "turn-failed" }, 201))
      .mockResolvedValueOnce(jsonResponse({ error: "Whisper is unavailable." }, 502));
    const session = await new ServerSpeechToTextProvider({
      fetch: fetcher,
    }).createSession({
      sessionId: "turn-failed",
      language: "nl-NL",
      signal: new AbortController().signal,
    });

    await expect(session.finish()).rejects.toThrow("Whisper is unavailable.");
    await expect(session.events[Symbol.asyncIterator]().next()).rejects.toThrow(
      "Whisper is unavailable.",
    );
  });
});
