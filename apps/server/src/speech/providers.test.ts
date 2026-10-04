import { describe, expect, it } from "vitest";
import { createSpeechProviders } from "./providers.js";

describe("speech provider selection", () => {
  it("selects STT and TTS independently and provides deterministic mocks", async () => {
    const { stt, tts } = createSpeechProviders({
      STT_PROVIDER: "mock",
      TTS_PROVIDER: "mock",
    });
    const signal = new AbortController().signal;
    await expect(stt.transcribe({
      audio: new Uint8Array([1]), mimeType: "audio/wav", language: "nl-NL", signal,
    })).resolves.toEqual({ text: "Dit is een test." });
    const chunks: Uint8Array[] = [];
    for await (const chunk of tts.synthesize({
      sessionId: "s", speechId: "t", language: "nl-NL", text: "Hallo",
    }, signal)) chunks.push(chunk);
    expect(chunks).toEqual([new Uint8Array([0, 0, 0, 0])]);
  });

  it("requires settings for selected providers without fallback", () => {
    expect(() => createSpeechProviders({
      STT_PROVIDER: "whisper-cpp", TTS_PROVIDER: "mock",
    })).toThrow("WHISPER_CPP_URL");
    expect(() => createSpeechProviders({
      STT_PROVIDER: "mock", TTS_PROVIDER: "piper",
    })).toThrow("PIPER_MODEL_PATH");
    expect(() => createSpeechProviders({
      STT_PROVIDER: "mock", TTS_PROVIDER: "piper-http",
    })).toThrow("PIPER_HTTP_URL");
    expect(() => createSpeechProviders({
      STT_PROVIDER: "azure", TTS_PROVIDER: "mock",
    })).toThrow("STT_PROVIDER");
  });
});
