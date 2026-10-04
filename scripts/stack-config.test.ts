import { describe, expect, it } from "vitest";
import { resolveStack } from "./stack-config.js";

const base = {
  STT_PROVIDER: "whisper-cpp",
  TTS_PROVIDER: "piper",
  LLM_PROVIDER: "mock",
  HOME_PROVIDER: "simulator",
  HOME_ADMIN_UI: "1",
};

describe("development stack selection", () => {
  it("starts only selected local profiles with stable internal APIs", () => {
    const selected = resolveStack(base);
    expect(selected.profiles).toEqual(["whisper", "piper", "home-simulator"]);
    expect(selected.environment).toMatchObject({
      STT_PROVIDER: "whisper-cpp",
      WHISPER_CPP_URL: "http://whisper:8080",
      TTS_PROVIDER: "piper-http",
      PIPER_HTTP_URL: "http://piper:5000",
      LLM_PROVIDER: "mock",
      HOME_ADMIN_FILE: "Caddyfile.admin",
    });
  });

  it("uses explicitly configured endpoints without starting matching engines", () => {
    const selected = resolveStack({
      ...base,
      WHISPER_CPP_URL: "http://host.docker.internal:8081",
      PIPER_HTTP_URL: "https://tts.example.test",
      LLM_PROVIDER: "openai-compatible",
      LLM_BASE_URL: "https://ai.example.test/v1",
      LLM_MODEL: "model-1",
      HOME_PROVIDER: "external-api",
      HOME_API_URL: "https://home.example.test",
      HOME_ADMIN_UI: "0",
    });
    expect(selected.profiles).toEqual([]);
    expect(selected.environment).toMatchObject({
      WHISPER_CPP_URL: "http://host.docker.internal:8081",
      PIPER_HTTP_URL: "https://tts.example.test",
      LLM_BASE_URL: "https://ai.example.test/v1",
      HOME_API_UPSTREAM: "https://home.example.test",
      HOME_ADMIN_FILE: "Caddyfile.desktop",
    });
  });

  it("preserves an explicit Piper root URL and rejects Home upstream paths", () => {
    const selected = resolveStack({
      ...base, TTS_PROVIDER: "piper-http",
      PIPER_HTTP_URL: "https://tts.example.test/",
      HOME_PROVIDER: "external-api", HOME_ADMIN_UI: "0",
      HOME_API_URL: "https://home.example.test",
    });
    expect(selected.environment.PIPER_HTTP_URL).toBe("https://tts.example.test/");
    expect(() => resolveStack({
      ...base, HOME_PROVIDER: "external-api", HOME_ADMIN_UI: "0",
      HOME_API_URL: "https://home.example.test/sodalis",
    })).toThrow("HOME_API_URL must be an origin");
  });

  it("requires explicit LLM and Home providers and rejects incomplete or invalid selections", () => {
    expect(() => resolveStack({ STT_PROVIDER: "mock", TTS_PROVIDER: "mock" }))
      .toThrow("LLM_PROVIDER");
    expect(() => resolveStack({ ...base, HOME_PROVIDER: "" })).toThrow("HOME_PROVIDER");
    expect(() => resolveStack({ ...base, LLM_PROVIDER: "azure" })).toThrow("LLM_PROVIDER");
    expect(() => resolveStack({ ...base, STT_PROVIDER: "azure" })).toThrow("STT_PROVIDER");
    expect(() => resolveStack({ ...base, TTS_PROVIDER: "piper-http" })).toThrow("PIPER_HTTP_URL");
    expect(() => resolveStack({ ...base, HOME_ADMIN_UI: "0" })).toThrow("HOME_ASSISTANT_TOKEN");
  });

  it("activates CPU LLM and authenticated Home profiles only when selected", () => {
    const selected = resolveStack({
      ...base,
      STT_PROVIDER: "mock",
      TTS_PROVIDER: "mock",
      LLM_PROVIDER: "openai-compatible",
      LLM_MODEL: "local.gguf",
      HOME_ADMIN_UI: "0",
      HOME_ASSISTANT_TOKEN: "local-test-token",
    });
    expect(selected.profiles).toEqual(["llm", "home-simulator", "home-api"]);
    expect(selected.environment.LLM_BASE_URL).toBe("http://llm:8080/v1");
    expect(selected.environment.HOME_ASSISTANT_TOKEN).toBe("local-test-token");
  });
});
