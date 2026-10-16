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
    })).toThrow("AZURE_STT_URL");
    expect(() => createSpeechProviders({
      STT_PROVIDER: "whistle", TTS_PROVIDER: "mock",
    })).toThrow("WHISTLE_URL");
    expect(() => createSpeechProviders({
      STT_PROVIDER: "parakeet-tdt", TTS_PROVIDER: "mock",
    })).toThrow("PARAKEET_TDT_URL");
    expect(() => createSpeechProviders({
      STT_PROVIDER: "mock", TTS_PROVIDER: "azure",
    })).toThrow("AZURE_TTS_URL");
  });

  it("selects Azure TTS only when its HTTPS endpoint, key and Dutch voice are explicit", () => {
    const { tts } = createSpeechProviders({
      STT_PROVIDER: "mock",
      TTS_PROVIDER: "azure",
      AZURE_TTS_URL: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      AZURE_TTS_KEY: "test-key",
      AZURE_TTS_VOICE: "nl-NL-ColetteNeural",
    });
    expect(tts.voiceId).toBe("nl-NL-ColetteNeural");
    expect(() => createSpeechProviders({
      STT_PROVIDER: "mock",
      TTS_PROVIDER: "azure",
      AZURE_TTS_URL: "http://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      AZURE_TTS_KEY: "test-key",
      AZURE_TTS_VOICE: "nl-NL-ColetteNeural",
    })).toThrow("HTTPS");
  });

  it("selects final-only Azure STT only with its own explicit endpoint and key", () => {
    const azureSttUrl =
      "https://example.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15";
    const { stt } = createSpeechProviders({
      STT_PROVIDER: "azure",
      TTS_PROVIDER: "mock",
      AZURE_STT_URL: azureSttUrl,
      AZURE_STT_KEY: "stt-key",
    });
    expect(stt.partialResults).toBe(false);
    expect(() => createSpeechProviders({
      STT_PROVIDER: "azure",
      TTS_PROVIDER: "mock",
      AZURE_STT_URL: azureSttUrl,
      AZURE_TTS_KEY: "tts-key",
    })).toThrow("AZURE_STT_KEY");
    expect(createSpeechProviders({
      PARAKEET_TDT_URL: "http://parakeet-tdt:8080",
      TTS_PROVIDER: "mock",
      AZURE_STT_URL: azureSttUrl,
      AZURE_STT_KEY: "stt-key",
    }).stt.partialResults).not.toBe(false);
  });
});
