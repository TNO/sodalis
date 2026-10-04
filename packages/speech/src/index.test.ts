import { describe, expect, it } from "vitest";
import {
  MockSpeechToTextProvider,
  MockTextToSpeechProvider,
  resolveSpeechProviders,
  validateSpeechConfiguration,
} from "./index.js";

describe("speech configuration", () => {
  it("allows STT and TTS to select providers independently", () => {
    expect(
      validateSpeechConfiguration({ stt: "server", tts: "browser" }),
    ).toEqual({
      ok: true,
      configuration: { stt: "server", tts: "browser" },
    });
  });

  it("reports invalid STT and TTS provider selections", () => {
    expect(
      validateSpeechConfiguration({ stt: "device", tts: null }),
    ).toEqual({
      ok: false,
      issues: [
        { path: "stt", message: 'Must be "browser", "server", or "auto".' },
        { path: "tts", message: 'Must be "browser", "server", or "auto".' },
      ],
    });
  });

  it("routes the configured STT and TTS preferences independently", () => {
    const browserStt = {
      id: "browser-stt",
      capabilities: { runtime: "browser" as const },
    };
    const serverStt = {
      id: "server-stt",
      capabilities: { runtime: "server" as const },
    };
    const browserTts = {
      id: "browser-tts",
      capabilities: { runtime: "browser" as const },
    };
    const serverTts = {
      id: "server-tts",
      capabilities: { runtime: "server" as const },
    };

    expect(
      resolveSpeechProviders(
        { stt: "server", tts: "browser" },
        [browserStt, serverStt],
        [browserTts, serverTts],
      ),
    ).toEqual({ stt: serverStt, tts: browserTts });
  });

  it("uses the first registered provider for each auto preference", () => {
    const browserStt = {
      id: "browser-stt",
      capabilities: { runtime: "browser" as const },
    };
    const serverStt = {
      id: "server-stt",
      capabilities: { runtime: "server" as const },
    };
    const serverTts = {
      id: "server-tts",
      capabilities: { runtime: "server" as const },
    };
    const browserTts = {
      id: "browser-tts",
      capabilities: { runtime: "browser" as const },
    };

    expect(
      resolveSpeechProviders(
        { stt: "auto", tts: "auto" },
        [serverStt, browserStt],
        [browserTts, serverTts],
      ),
    ).toEqual({ stt: serverStt, tts: browserTts });
  });

  it("fails explicitly when the requested provider is unavailable", () => {
    expect(() =>
      resolveSpeechProviders({ stt: "browser", tts: "server" }, [], []),
    ).toThrow('No provider is registered for "browser" speech selection.');
  });
});

describe("mock STT provider", () => {
  it("streams partial and final results tagged with the session ID", async () => {
    const provider = new MockSpeechToTextProvider({
      events: [
        { type: "partial", text: "goedemorgen" },
        { type: "final", text: "goedemorgen", confidence: 0.98 },
      ],
    });
    const session = await provider.createSession({
      sessionId: "turn-7",
      language: "nl-NL",
      signal: new AbortController().signal,
    });
    const events = [];

    for await (const event of session.events) events.push(event);

    expect(events).toEqual([
      { type: "partial", text: "goedemorgen", sessionId: "turn-7" },
      {
        type: "final",
        text: "goedemorgen",
        confidence: 0.98,
        sessionId: "turn-7",
      },
    ]);
  });

  it("stops emitting session events after cancellation", async () => {
    const abortController = new AbortController();
    const provider = new MockSpeechToTextProvider({
      events: [
        { type: "partial", text: "hallo" },
        { type: "final", text: "hallo" },
      ],
    });
    const session = await provider.createSession({
      sessionId: "turn-cancel",
      language: "nl-NL",
      signal: abortController.signal,
    });
    const events = session.events[Symbol.asyncIterator]();

    await expect(events.next()).resolves.toMatchObject({
      value: { type: "partial", sessionId: "turn-cancel" },
      done: false,
    });
    abortController.abort();

    await expect(events.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("mock TTS provider", () => {
  it("advertises supported timing metadata", () => {
    const provider = new MockTextToSpeechProvider();

    expect(provider.capabilities).toMatchObject({
      streamingAudio: true,
      phonemeTiming: true,
      visemeTiming: true,
      wordTiming: true,
      emotionStyleControl: false,
    });
  });

  it("streams audio and timing chunks with ordered session IDs", async () => {
    const provider = new MockTextToSpeechProvider({
      chunks: [
        {
          type: "audio",
          data: Uint8Array.from([1, 2]),
          mimeType: "audio/wav",
        },
        {
          type: "timing",
          kind: "word",
          value: "Hallo",
          startMs: 0,
          endMs: 120,
        },
      ],
    });
    const output = [];
    for await (const chunk of provider.speak(
      {
        sessionId: "turn-8",
        speechId: "speech-3",
        text: "Hallo",
        language: "nl-NL",
      },
      new AbortController().signal,
    )) {
      output.push(chunk);
    }

    expect(output).toEqual([
      {
        type: "audio",
        data: Uint8Array.from([1, 2]),
        mimeType: "audio/wav",
        sessionId: "turn-8",
        speechId: "speech-3",
        sequence: 0,
      },
      {
        type: "timing",
        kind: "word",
        value: "Hallo",
        startMs: 0,
        endMs: 120,
        sessionId: "turn-8",
        speechId: "speech-3",
        sequence: 1,
      },
    ]);
  });

  it("aborts a speech stream without emitting later chunks", async () => {
    const abortController = new AbortController();
    const provider = new MockTextToSpeechProvider({
      chunks: [
        { type: "audio", data: new Uint8Array([1]), mimeType: "audio/wav" },
        { type: "audio", data: new Uint8Array([2]), mimeType: "audio/wav" },
      ],
    });
    const stream = provider.speak(
      {
        sessionId: "turn-cancel",
        speechId: "speech-cancel",
        text: "Stop",
        language: "en-US",
      },
      abortController.signal,
    );
    const chunks = stream[Symbol.asyncIterator]();

    await expect(chunks.next()).resolves.toMatchObject({
      value: { type: "audio", sequence: 0 },
      done: false,
    });
    abortController.abort();

    await expect(chunks.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});
