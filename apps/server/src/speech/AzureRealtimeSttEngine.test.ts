import { describe, expect, it, vi } from "vitest";
import {
  AzureRealtimeSttEngine,
  type PcmRecognizerFactory,
  type PcmTranscoderFactory,
  type RecognizerEvents,
} from "./AzureRealtimeSttEngine.js";

const endpoint = "https://soladis-foundry.cognitiveservices.azure.com/";

function createFakes() {
  const fake = {
    recognizerConfig: undefined as
      | { endpoint: URL; key: string; language: string }
      | undefined,
    events: undefined as unknown as RecognizerEvents,
    pcm: [] as Uint8Array[],
    audioEnded: 0,
    recognizerClosed: 0,
    transcoderMimeType: "",
    transcoderEnded: 0,
    transcoderKilled: 0,
  };
  const createRecognizer: PcmRecognizerFactory = (config, events) => {
    fake.recognizerConfig = config;
    fake.events = events;
    return {
      write(pcm) {
        fake.pcm.push(pcm);
      },
      endAudio() {
        fake.audioEnded += 1;
      },
      async close() {
        fake.recognizerClosed += 1;
      },
    };
  };
  const createTranscoder: PcmTranscoderFactory = ({ mimeType, onPcm }) => {
    fake.transcoderMimeType = mimeType;
    return {
      write(chunk) {
        onPcm(chunk);
      },
      async end() {
        fake.transcoderEnded += 1;
      },
      kill() {
        fake.transcoderKilled += 1;
      },
    };
  };
  return { fake, createRecognizer, createTranscoder };
}

describe("Azure real-time STT engine", () => {
  it("streams converted audio to Azure and serves its running hypothesis and final transcript", async () => {
    const { fake, createRecognizer, createTranscoder } = createFakes();
    const engine = new AzureRealtimeSttEngine({
      endpoint, key: "example-key", createRecognizer, createTranscoder,
    });
    expect(engine).toMatchObject({ provider: "azure", cloud: true, partialIntervalMs: 250 });

    const session = engine.startSession({ language: "nl-NL", mimeType: "audio/webm" });
    expect(fake.recognizerConfig).toEqual({
      endpoint: new URL(endpoint), key: "example-key", language: "nl-NL",
    });
    expect(fake.transcoderMimeType).toBe("audio/webm");

    session.write(new Uint8Array([1, 2]));
    expect(fake.pcm).toEqual([new Uint8Array([1, 2])]);
    fake.events.recognizing("Hoe");
    expect(session.partialText()).toBe("Hoe");
    fake.events.recognized("Hoe oud bent u?");
    fake.events.recognizing("Ik ben");
    expect(session.partialText()).toBe("Hoe oud bent u? Ik ben");

    const finished = session.finish();
    await vi.waitFor(() => expect(fake.audioEnded).toBe(1));
    expect(fake.transcoderEnded).toBe(1);
    fake.events.recognized("Ik ben tachtig.");
    fake.events.stopped();
    await expect(finished).resolves.toEqual({ text: "Hoe oud bent u? Ik ben tachtig." });
    expect(fake.recognizerClosed).toBe(1);
  });

  it("stops sending audio to Azure after 30 seconds and finishes with the transcript so far", async () => {
    const { fake, createRecognizer, createTranscoder } = createFakes();
    const engine = new AzureRealtimeSttEngine({
      endpoint, key: "example-key", createRecognizer, createTranscoder,
    });
    const session = engine.startSession({ language: "nl-NL", mimeType: "audio/webm" });
    const thirtySecondsOfPcm = 30 * 16000 * 2;

    session.write(new Uint8Array(thirtySecondsOfPcm - 10));
    session.write(new Uint8Array(20));
    session.write(new Uint8Array(20));
    expect(fake.pcm.map((pcm) => pcm.byteLength)).toEqual([thirtySecondsOfPcm - 10, 10]);
    expect(fake.audioEnded).toBe(1);
    expect(fake.transcoderKilled).toBe(1);

    fake.events.recognized("Een lang verhaal.");
    fake.events.stopped();
    await expect(session.finish()).resolves.toEqual({ text: "Een lang verhaal." });
    expect(fake.transcoderEnded).toBe(0);
    expect(fake.audioEnded).toBe(1);
  });

  it("releases FFmpeg and the Azure connection when a session is cancelled", async () => {
    const { fake, createRecognizer, createTranscoder } = createFakes();
    const engine = new AzureRealtimeSttEngine({
      endpoint, key: "example-key", createRecognizer, createTranscoder,
    });
    const session = engine.startSession({ language: "nl-NL", mimeType: "audio/webm" });
    session.write(new Uint8Array([1]));
    const finished = session.finish();

    session.cancel();
    await expect(finished).rejects.toThrow("Speech recognition was cancelled.");
    expect(fake.transcoderKilled).toBe(1);
    expect(fake.recognizerClosed).toBe(1);
    session.cancel();
    expect(fake.recognizerClosed).toBe(1);
  });

  it("surfaces recognizer and conversion failures without exposing the key", async () => {
    for (const source of ["recognizer", "transcoder"] as const) {
      const { fake, createRecognizer } = createFakes();
      let transcoderError: ((error: Error) => void) | undefined;
      let killed = 0;
      const engine = new AzureRealtimeSttEngine({
        endpoint,
        key: "example-key",
        createRecognizer,
        createTranscoder: ({ onError }) => {
          transcoderError = onError;
          return { write() {}, async end() {}, kill: () => { killed += 1; } };
        },
      });
      const session = engine.startSession({ language: "nl-NL", mimeType: "audio/webm" });
      const failure = new Error("Authentication failed for example-key (401).");
      if (source === "recognizer") fake.events.failed(failure);
      else transcoderError!(failure);

      const message = "Azure STT failed: Authentication failed for [redacted] (401).";
      expect(() => session.partialText()).toThrow(message);
      expect(() => session.write(new Uint8Array([1]))).toThrow(message);
      await expect(session.finish()).rejects.toThrow(message);
      expect(killed).toBe(1);
      expect(fake.recognizerClosed).toBe(1);
    }
  });

  it("rejects unsafe configuration and unsupported languages before connecting", () => {
    const { fake, createRecognizer, createTranscoder } = createFakes();
    for (const invalid of [
      "http://soladis-foundry.cognitiveservices.azure.com/",
      "https://user:pass@soladis-foundry.cognitiveservices.azure.com/",
      "https://soladis-foundry.cognitiveservices.azure.com/?language=de-DE",
      "https://soladis-foundry.cognitiveservices.azure.com/#x",
      "https://example.com/",
      "https://westeurope.api.cognitive.microsoft.com/",
      "not a url",
    ]) {
      expect(() => new AzureRealtimeSttEngine({
        endpoint: invalid, key: "example-key", createRecognizer, createTranscoder,
      })).toThrow(/AZURE_STT_ENDPOINT/);
    }
    expect(() => new AzureRealtimeSttEngine({
      endpoint, key: " ", createRecognizer, createTranscoder,
    })).toThrow(/AZURE_STT_KEY/);

    const engine = new AzureRealtimeSttEngine({
      endpoint, key: "example-key", createRecognizer, createTranscoder,
    });
    expect(() => engine.startSession({ language: "de-DE", mimeType: "audio/webm" }))
      .toThrow('Azure STT does not support "de-DE".');
    expect(fake.recognizerConfig).toBeUndefined();
    engine.startSession({ language: "en-us", mimeType: "audio/ogg" });
    expect(fake.recognizerConfig?.language).toBe("en-US");
  });

  it("fails and releases the session when Azure never delivers the final result", async () => {
    vi.useFakeTimers();
    try {
      const { fake, createRecognizer, createTranscoder } = createFakes();
      const engine = new AzureRealtimeSttEngine({
        endpoint, key: "example-key", createRecognizer, createTranscoder,
      });
      const session = engine.startSession({ language: "nl-NL", mimeType: "audio/webm" });
      const finished = session.finish();
      const assertion = expect(finished).rejects.toThrow(
        "Azure STT did not return a final transcript within 10 seconds.",
      );
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
      expect(fake.recognizerClosed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
