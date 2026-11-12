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
  it("maps explicit companion data settings to the AI container without copying its source", () => {
    const selected = resolveStack({
      ...base, COMPANION_HARNESS: "pi",
      HOME_GRAPH_URL: "bolt://host.docker.internal:7687",
      HOME_GRAPH_PASSWORD: "test", HOME_GRAPH_SCOPE: "test-scope",
      HOME_DATA_SQLITE_FILE: "/srv/simulator/timeseries.sqlite",
      HOME_DATA_SQLITE_ENDPOINT: "local://simulation/timeseries.sqlite",
    });
    expect(selected.environment).toMatchObject({
      COMPANION_HARNESS: "pi",
      HOME_GRAPH_URL: "bolt://host.docker.internal:7687",
      HOME_GRAPH_PASSWORD: "test",
      HOME_GRAPH_SCOPE: "test-scope",
      HOME_DATA_SQLITE_SOURCE: "/srv/simulator/timeseries.sqlite",
      HOME_DATA_SQLITE_FILE: "/data/home/readings.sqlite",
      HOME_DATA_SQLITE_ENDPOINT: "local://simulation/timeseries.sqlite",
    });
    expect(selected.profiles).toEqual(resolveStack(base).profiles);
  });

  it("leaves companion settings and the optional data mount off by default", () => {
    expect(resolveStack(base).environment).toMatchObject({
      COMPANION_HARNESS: "off", HOME_GRAPH_URL: "", HOME_GRAPH_PASSWORD: "",
      HOME_DATA_SQLITE_FILE: "", HOME_DATA_SQLITE_SOURCE: "",
      NODE_ENV: "development", COMPANION_AUDIT: "false",
    });
    expect(resolveStack({ ...base, COMPANION_HARNESS: "pi" }).environment.HOME_DATA_SQLITE_SOURCE).toBe("");
  });

  it("allows explicit audit only outside production", () => {
    expect(resolveStack({ ...base, COMPANION_AUDIT: "true" }).environment.COMPANION_AUDIT).toBe("true");
    expect(() => resolveStack({ ...base, COMPANION_AUDIT: "true", NODE_ENV: "production" }))
      .toThrow(/audit.*production/i);
    expect(() => resolveStack({ ...base, COMPANION_AUDIT: "maybe" })).toThrow(/COMPANION_AUDIT/);
  });

  it("wires only the off/mock email selection and rejects old provider values", () => {
    const mock = resolveStack({
      ...base,
      COMPANION_HARNESS: "pi",
      EMAIL_PROVIDER: "mock",
    });
    expect(mock.environment).toMatchObject({
      EMAIL_PROVIDER: "mock",
    });
    expect(mock.environment).not.toHaveProperty("EMAIL_OAUTH_CLIENT_ID");
    expect(mock.environment).not.toHaveProperty("EMAIL_OAUTH_CLIENT_SECRET_REF");
    expect(() => resolveStack({ ...base, EMAIL_PROVIDER: "graph" })).toThrow(/EMAIL_PROVIDER/);
    expect(() => resolveStack({ ...base, EMAIL_PROVIDER: "gmail" })).toThrow(/EMAIL_PROVIDER/);
  });

  it.each([
    { COMPANION_HARNESS: "typo" },
    { COMPANION_HARNESS: "off", HOME_GRAPH_PASSWORD: "unused" },
    { COMPANION_HARNESS: "pi", HOME_GRAPH_URL: "bolt://graph:7687" },
    { COMPANION_HARNESS: "pi", HOME_DATA_SQLITE_FILE: "/data/test.sqlite" },
    { COMPANION_HARNESS: "pi", HOME_GRAPH_URL: "https://graph", HOME_GRAPH_PASSWORD: "test" },
    { COMPANION_HARNESS: "pi", HOME_GRAPH_URL: "bolt://user:pass@graph:7687", HOME_GRAPH_PASSWORD: "test" },
    { COMPANION_HARNESS: "pi", HOME_GRAPH_URL: "bolt://graph:7687/path", HOME_GRAPH_PASSWORD: "test" },
    { COMPANION_HARNESS: "pi", HOME_GRAPH_URL: "bolt://graph:7687?secret=x", HOME_GRAPH_PASSWORD: "test" },
    { COMPANION_HARNESS: "pi", HOME_GRAPH_URL: "bolt://graph:7687", HOME_GRAPH_PASSWORD: "test", HOME_DATA_SQLITE_FILE: "relative.sqlite" },
    { COMPANION_HARNESS: "pi", HOME_GRAPH_URL: "bolt://graph:7687", HOME_GRAPH_PASSWORD: "test", HOME_DATA_SQLITE_ENDPOINT: "local://unused" },
  ])("rejects inconsistent companion settings %j", (settings) => {
    expect(() => resolveStack({ ...base, ...settings })).toThrow();
  });

  it("enables Pi in the example and requires an explicit graph password before launch", () => {
    const example = parseEnv(
      readFileSync(resolve(import.meta.dirname, "../.env.example"), "utf8"),
    );
    expect(example.HOME_GRAPH_PASSWORD).toBe("");
    expect(() => resolveStack(example)).toThrow("Set HOME_GRAPH_PASSWORD");
    const selected = resolveStack({ ...example, HOME_GRAPH_PASSWORD: "synthetic-test-password" });
    expect(selected.profiles).toEqual(["parakeet-tdt", "piper", "home-simulator"]);
    expect(selected.models).toEqual(expect.arrayContaining([
      "models/piper/nl_NL-ronnie-medium.onnx",
      "models/piper/nl_NL-ronnie-medium.onnx.json",
    ]));
    expect(selected.environment).toMatchObject({
      COMPANION_HARNESS: "pi",
      HOME_GRAPH_URL: "bolt://neo4j:7687",
      HOME_GRAPH_USER: "neo4j",
      HOME_GRAPH_DATABASE: "neo4j",
      HOME_GRAPH_SCOPE: "cphs:simulation:couple-apartment",
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
      WHISPER_MODEL: "ggml-small.bin",
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

  it("selects Azure real-time STT only with explicit credentials and no local STT profile", () => {
    const azureSttEndpoint = "https://soladis-foundry.cognitiveservices.azure.com/";
    const selected = resolveStack({
      ...base,
      STT_PROVIDER: "azure",
      AZURE_STT_ENDPOINT: azureSttEndpoint,
      AZURE_STT_KEY: "test-key",
    });
    expect(selected.profiles).toEqual(["piper", "home-simulator"]);
    expect(selected.environment).toMatchObject({
      STT_PROVIDER: "azure",
      AZURE_STT_ENDPOINT: azureSttEndpoint,
      AZURE_STT_KEY: "test-key",
    });
    expect(() => resolveStack({ ...base, STT_PROVIDER: "azure" })).toThrow("AZURE_STT_ENDPOINT");
    expect(() => resolveStack({
      ...base, STT_PROVIDER: "azure", AZURE_STT_ENDPOINT: azureSttEndpoint,
    })).toThrow("AZURE_STT_KEY");
    expect(() => resolveStack({
      ...base, STT_PROVIDER: "azure", AZURE_STT_KEY: "test-key",
      AZURE_STT_ENDPOINT: "https://example.com/",
    })).toThrow("AZURE_STT_ENDPOINT must be");
    expect(() => resolveStack({
      ...base, STT_PROVIDER: "parakeet-tdt", AZURE_STT_KEY: "unused",
    })).toThrow("AZURE_STT_KEY requires STT_PROVIDER=azure");
    expect(() => resolveStack({
      ...base, STT_PROVIDER: "azure", AZURE_STT_KEY: "test-key",
      AZURE_STT_URL: "https://example.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15",
    })).toThrow("AZURE_STT_URL was replaced by AZURE_STT_ENDPOINT");
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

  it("selects an Azure voice from a Foundry resource, but not from a Foundry project endpoint", () => {
    const foundry = {
      ...base,
      TTS_PROVIDER: "azure",
      AZURE_TTS_URL: "https://soladis-foundry.cognitiveservices.azure.com/",
      AZURE_TTS_KEY: "test-key",
      AZURE_TTS_VOICE: "en-US-Adam:DragonHDLatestNeural",
    };
    expect(resolveStack(foundry).environment).toMatchObject({
      AZURE_TTS_URL: "https://soladis-foundry.cognitiveservices.azure.com",
      AZURE_TTS_VOICE: "en-US-Adam:DragonHDLatestNeural",
    });
    expect(() => resolveStack({
      ...foundry, AZURE_TTS_URL: "https://soladis-foundry.services.ai.azure.com/api/projects/sodalis",
    })).toThrow(/project endpoint/);
  });

  it("requires explicit LLM and Home providers and rejects incomplete or invalid selections", () => {
    expect(() => resolveStack({ STT_PROVIDER: "mock", TTS_PROVIDER: "mock" }))
      .toThrow("LLM_PROVIDER");
    expect(() => resolveStack({ ...base, HOME_PROVIDER: "" })).toThrow("HOME_PROVIDER");
    expect(() => resolveStack({ ...base, LLM_PROVIDER: "azure" })).toThrow("AZURE_LLM_URL");
    expect(() => resolveStack({ ...base, STT_PROVIDER: "azure-speech" })).toThrow("STT_PROVIDER");
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
