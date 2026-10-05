import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { resolveStack, serviceNamePrefix } from "./stack-config.js";

const base = {
  STT_PROVIDER: "whisper-cpp",
  TTS_PROVIDER: "piper",
  LLM_PROVIDER: "mock",
  HOME_PROVIDER: "simulator",
  HOME_ADMIN_UI: "1",
};

describe("development stack selection", () => {
  it("wires the example to host Ollama without activating a local LLM container", () => {
    const example = parseEnv(
      readFileSync(resolve(import.meta.dirname, "../.env.example"), "utf8"),
    );
    const selected = resolveStack(example);
    expect(selected.profiles).toEqual(["parakeet-tdt", "piper", "home-simulator"]);
    expect(selected.environment).toMatchObject({
      STT_PROVIDER: "parakeet-tdt",
      PARAKEET_TDT_URL: "http://parakeet-tdt:8080",
      LLM_PROVIDER: "openai-compatible",
      LLM_BASE_URL: "http://host.docker.internal:11434/v1",
      LLM_MODEL: "llama3.2:3b",
    });
  });

  it("names root-checkout services without a repeated prefix while keeping worktrees distinct", () => {
    expect(serviceNamePrefix("sodalis")).toBe("sodalis");
    expect(serviceNamePrefix("silver-giggle")).toBe("sodalis-silver-giggle");
    expect(serviceNamePrefix("sodalis-feature")).toBe("sodalis-feature");
  });

  it("starts only selected local profiles with stable internal APIs", () => {
    const selected = resolveStack(base);
    expect(selected.profiles).toEqual(["whisper", "piper", "home-simulator"]);
    expect(selected.environment).toMatchObject({
      STT_PROVIDER: "whisper-cpp",
      WHISPER_CPP_URL: "http://whisper:8080",
      WHISPER_MODEL: "ggml-base.bin",
      TTS_PROVIDER: "piper-http",
      PIPER_HTTP_URL: "http://piper:5000",
      LLM_PROVIDER: "mock",
      HOME_ADMIN_FILE: "Caddyfile.admin",
    });
  });

  it("defaults to Parakeet while retaining an explicit Whisper selection", () => {
    const selected = resolveStack({
      TTS_PROVIDER: "piper",
      LLM_PROVIDER: "mock",
      HOME_PROVIDER: "simulator",
      HOME_ADMIN_UI: "1",
    });
    expect(selected.profiles).toEqual(["parakeet-tdt", "piper", "home-simulator"]);
    expect(selected.environment.STT_PROVIDER).toBe("parakeet-tdt");
  });

  it("selects a downloaded Whisper model without accepting path traversal or unused settings", () => {
    const selected = resolveStack({ ...base, WHISPER_MODEL: "ggml-small.bin" });
    expect(selected.models).toContain("models/whisper/ggml-small.bin");
    expect(selected.environment.WHISPER_MODEL).toBe("ggml-small.bin");
    expect(() => resolveStack({ ...base, WHISPER_MODEL: "../outside.bin" }))
      .toThrow("WHISPER_MODEL");
    expect(() => resolveStack({
      ...base, WHISPER_MODEL: "ggml-small.bin",
      WHISPER_CPP_URL: "http://host.docker.internal:4301",
    })).toThrow("WHISPER_MODEL");
  });

  it("selects Whistle locally or by explicit endpoint without activating Whisper", () => {
    const local = resolveStack({ ...base, STT_PROVIDER: "whistle" });
    expect(local.profiles).toEqual(["whistle", "piper", "home-simulator"]);
    expect(local.environment).toMatchObject({
      STT_PROVIDER: "whistle",
      WHISTLE_URL: "http://whistle:8080",
    });

    const external = resolveStack({
      ...base, STT_PROVIDER: "whistle",
      WHISTLE_URL: "http://host.docker.internal:4307",
    });
    expect(external.profiles).not.toContain("whistle");
    expect(external.environment.WHISTLE_URL)
      .toBe("http://host.docker.internal:4307");
    expect(() => resolveStack({
      ...base, STT_PROVIDER: "whistle", WHISPER_MODEL: "ggml-base.bin",
    })).toThrow("WHISPER_MODEL");
    expect(() => resolveStack({
      ...base, STT_PROVIDER: "whisper-cpp", WHISTLE_URL: "http://whistle:8080",
    })).toThrow("WHISTLE_URL");
  });

  it("selects original Parakeet TDT v3 with its own service, never Redux", () => {
    const local = resolveStack({ ...base, STT_PROVIDER: "parakeet-tdt" });
    expect(local.profiles).toEqual(["parakeet-tdt", "piper", "home-simulator"]);
    expect(local.environment).toMatchObject({
      STT_PROVIDER: "parakeet-tdt",
      PARAKEET_TDT_URL: "http://parakeet-tdt:8080",
    });
    const external = resolveStack({
      ...base, STT_PROVIDER: "parakeet-tdt",
      PARAKEET_TDT_URL: "http://host.docker.internal:4309",
    });
    expect(external.profiles).not.toContain("parakeet-tdt");
    expect(() => resolveStack({
      ...base, STT_PROVIDER: "whistle",
      PARAKEET_TDT_URL: "http://parakeet-tdt:8080",
    })).toThrow("PARAKEET_TDT_URL");
    expect(() => resolveStack({ ...base, STT_PROVIDER: "parakeet-redux" }))
      .toThrow("Unsupported STT_PROVIDER");
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

  it("selects Azure TTS only with explicit credentials and no local Piper profile", () => {
    const selected = resolveStack({
      ...base,
      TTS_PROVIDER: "azure",
      AZURE_TTS_URL: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      AZURE_TTS_KEY: "test-key",
      AZURE_TTS_VOICE: "nl-NL-ColetteNeural",
    });
    expect(selected.profiles).toEqual(["whisper", "home-simulator"]);
    expect(selected.environment).toMatchObject({
      TTS_PROVIDER: "azure",
      AZURE_TTS_VOICE: "nl-NL-ColetteNeural",
    });
    expect(() => resolveStack({
      ...base, TTS_PROVIDER: "azure",
    })).toThrow("AZURE_TTS_URL");
    expect(() => resolveStack({
      ...base, AZURE_TTS_KEY: "unused",
    })).toThrow("AZURE_TTS_KEY");
  });

  it("requires explicit LLM and Home providers and rejects incomplete or invalid selections", () => {
    expect(() => resolveStack({ STT_PROVIDER: "mock", TTS_PROVIDER: "mock" }))
      .toThrow("LLM_PROVIDER");
    expect(() => resolveStack({ ...base, HOME_PROVIDER: "" })).toThrow("HOME_PROVIDER");
    expect(() => resolveStack({ ...base, LLM_PROVIDER: "azure" })).toThrow("LLM_PROVIDER");
    expect(() => resolveStack({ ...base, STT_PROVIDER: "azure" })).toThrow("STT_PROVIDER");
    expect(() => resolveStack({ ...base, TTS_PROVIDER: "piper-http" })).toThrow("PIPER_HTTP_URL");
    expect(() => resolveStack({ ...base, TTS_PROVIDER: "fish-speech-1.5" }))
      .toThrow("Unsupported TTS_PROVIDER");
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
