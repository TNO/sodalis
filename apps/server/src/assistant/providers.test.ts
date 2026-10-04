import { describe, expect, it } from "vitest";
import { createLlmProvider } from "./providers.js";

describe("AI provider selection", () => {
  it("requires explicit provider and its own configuration", () => {
    expect(() => createLlmProvider({})).toThrow("LLM_PROVIDER");
    expect(() => createLlmProvider({ LLM_PROVIDER: "azure" })).toThrow("LLM_PROVIDER");
    expect(() => createLlmProvider({ LLM_PROVIDER: "openai-compatible" })).toThrow("LLM_BASE_URL");
    expect(() => createLlmProvider({
      LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: "http://localhost/v1",
    })).toThrow("LLM_MODEL");
  });

  it("streams a deterministic semantic utterance from the selected mock", async () => {
    const provider = createLlmProvider({ LLM_PROVIDER: "mock" });
    const chunks: string[] = [];
    for await (const text of provider.generate({
      messages: [{ role: "user", content: "Hallo" }],
      signal: new AbortController().signal,
    })) chunks.push(text);
    expect(JSON.parse(chunks.join(""))).toEqual({
      text: "Dit is een testantwoord.",
      affect: { expression: "neutral", valence: 0, arousal: 0.1, intensity: 0.1 },
      interruptible: true,
    });
  });

  it("selects the existing compatible provider only when requested", () => {
    expect(createLlmProvider({
      LLM_PROVIDER: "openai-compatible",
      LLM_BASE_URL: "http://localhost:1234/v1",
      LLM_MODEL: "local-model",
    }).id).toBe("openai-compatible-chat-completions");
  });
});
