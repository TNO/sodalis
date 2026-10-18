import { describe, expect, it } from "vitest";
import type { LlmTextGenerationProvider } from "./OpenAiCompatibleLlmProvider.js";
import { azureLlmExtraBody, createLlmProvider } from "./providers.js";

interface CapturedRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

function capture(): { readonly requests: CapturedRequest[]; readonly fetch: typeof fetch } {
  const requests: CapturedRequest[] = [];
  return {
    requests,
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response('data: {"choices":[{"delta":{"content":"Hoi"}}]}\n\ndata: [DONE]\n\n', {
        headers: { "content-type": "text/event-stream" },
      });
    },
  };
}

async function generate(provider: LlmTextGenerationProvider): Promise<string> {
  let text = "";
  for await (const chunk of provider.generate({
    messages: [{ role: "user", content: "Hallo" }],
    signal: new AbortController().signal,
  })) text += chunk;
  return text;
}

const azure = {
  LLM_PROVIDER: "azure",
  AZURE_LLM_URL: "https://example.openai.azure.com/openai/v1",
  AZURE_LLM_KEY: "cloud-key",
  AZURE_LLM_DEPLOYMENT: "gpt-5",
};

describe("AI provider selection", () => {
  it("requires explicit provider and its own configuration", () => {
    expect(() => createLlmProvider({})).toThrow(
      "Set LLM_PROVIDER to mock, openai-compatible or azure.",
    );
    expect(() => createLlmProvider({ LLM_PROVIDER: "gemini" })).toThrow('Unsupported LLM_PROVIDER "gemini".');
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

  it("sends Azure OpenAI v1 chat completions with the key header, deployment, and reasoning effort", async () => {
    const { requests, fetch } = capture();
    const provider = createLlmProvider({ ...azure, AZURE_LLM_URL: "https://example.openai.azure.com" }, { fetch });

    expect(provider.id).toBe("azure-openai-v1");
    expect(await generate(provider)).toBe("Hoi");
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe("https://example.openai.azure.com/openai/v1/chat/completions");
    expect(request?.headers["api-key"]).toBe("cloud-key");
    expect(request?.headers).not.toHaveProperty("authorization");
    expect(request?.body).toMatchObject({
      model: "gpt-5",
      reasoning_effort: "minimal",
      stream: true,
      response_format: { type: "json_object" },
    });
    expect(request?.body).not.toHaveProperty("temperature");
    expect(request?.body).not.toHaveProperty("max_tokens");
  });

  it("accepts Azure resource endpoints on every supported host and an explicit reasoning effort", async () => {
    const { requests, fetch } = capture();
    for (const url of [
      "https://example.openai.azure.com/openai/v1/",
      "https://example.services.ai.azure.com/",
      "https://example.cognitiveservices.azure.com/openai/v1",
    ]) {
      await generate(createLlmProvider({
        ...azure, AZURE_LLM_URL: url, AZURE_LLM_REASONING_EFFORT: "low",
      }, { fetch }));
    }
    expect(requests.map((request) => request.url)).toEqual([
      "https://example.openai.azure.com/openai/v1/chat/completions",
      "https://example.services.ai.azure.com/openai/v1/chat/completions",
      "https://example.cognitiveservices.azure.com/openai/v1/chat/completions",
    ]);
    expect(requests.map((request) => request.body.reasoning_effort)).toEqual(["low", "low", "low"]);
  });

  it("omits reasoning_effort for non-reasoning Azure deployments when the effort is off", async () => {
    const { requests, fetch } = capture();
    await generate(createLlmProvider({
      ...azure, AZURE_LLM_DEPLOYMENT: "gpt-4.1-mini", AZURE_LLM_REASONING_EFFORT: "off",
    }, { fetch }));
    expect(requests[0]?.body.model).toBe("gpt-4.1-mini");
    expect(requests[0]?.body).not.toHaveProperty("reasoning_effort");
    expect(azureLlmExtraBody({ ...azure, AZURE_LLM_REASONING_EFFORT: "off" })).toEqual({});
    expect(azureLlmExtraBody(azure)).toEqual({ reasoning_effort: "minimal" });
  });

  it("rejects incomplete or unsupported Azure configuration", () => {
    expect(() => createLlmProvider({ LLM_PROVIDER: "azure" })).toThrow("AZURE_LLM_URL");
    expect(() => createLlmProvider({ ...azure, AZURE_LLM_KEY: " " })).toThrow("AZURE_LLM_KEY");
    expect(() => createLlmProvider({ ...azure, AZURE_LLM_DEPLOYMENT: "" })).toThrow("AZURE_LLM_DEPLOYMENT");
    expect(() => createLlmProvider({ ...azure, AZURE_LLM_REASONING_EFFORT: "none" }))
      .toThrow("AZURE_LLM_REASONING_EFFORT");
    expect(() => createLlmProvider({ ...azure, AZURE_LLM_URL: "http://example.openai.azure.com/openai/v1" }))
      .toThrow("AZURE_LLM_URL must be an HTTPS URL");
    expect(() => createLlmProvider({ ...azure, AZURE_LLM_URL: "https://user:pass@example.openai.azure.com/" }))
      .toThrow("AZURE_LLM_URL must be an HTTPS URL");
    expect(() => createLlmProvider({ ...azure, AZURE_LLM_URL: "https://ai.example.test/openai/v1" }))
      .toThrow("AZURE_LLM_URL must be an Azure");
    expect(() => createLlmProvider({
      ...azure, AZURE_LLM_URL: "https://example.openai.azure.com/openai/deployments/gpt-5/chat/completions",
    })).toThrow("https://<resource>.openai.azure.com/openai/v1");
    expect(() => createLlmProvider({
      ...azure, AZURE_LLM_URL: "https://example.services.ai.azure.com/api/projects/sodalis",
    })).toThrow(/Foundry project endpoint.*https:\/\/<resource>\.openai\.azure\.com\/openai\/v1/);
  });

  it("uses only the selected provider's settings when local and Azure settings coexist", async () => {
    const local = {
      LLM_BASE_URL: "http://localhost:11434/v1",
      LLM_MODEL: "llama3.2:3b",
      LLM_API_KEY: "local-key",
    };
    const toAzure = capture();
    await generate(createLlmProvider({ ...local, ...azure }, { fetch: toAzure.fetch }));
    expect(toAzure.requests[0]?.url).toBe("https://example.openai.azure.com/openai/v1/chat/completions");
    expect(toAzure.requests[0]?.headers).not.toHaveProperty("authorization");
    expect(toAzure.requests[0]?.body.model).toBe("gpt-5");

    const toLocal = capture();
    const provider = createLlmProvider(
      { ...azure, ...local, LLM_PROVIDER: "openai-compatible" },
      { fetch: toLocal.fetch },
    );
    expect(provider.id).toBe("openai-compatible-chat-completions");
    await generate(provider);
    expect(toLocal.requests[0]?.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(toLocal.requests[0]?.headers).not.toHaveProperty("api-key");
    expect(JSON.stringify(toLocal.requests[0])).not.toContain("cloud-key");
    expect(toLocal.requests[0]?.body).not.toHaveProperty("reasoning_effort");
  });

  it("ignores every LLM setting when the mock is selected", async () => {
    const provider = createLlmProvider({
      ...azure,
      LLM_PROVIDER: "mock",
      AZURE_LLM_URL: "not a url",
      AZURE_LLM_REASONING_EFFORT: "extreme",
      LLM_BASE_URL: "http://localhost:11434/v1",
      LLM_MODEL: "llama3.2:3b",
    });
    expect(provider.id).toBe("mock");
    expect(JSON.parse(await generate(provider))).toMatchObject({ text: "Dit is een testantwoord." });
  });
});
