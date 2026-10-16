import { describe, expect, it } from "vitest";
import { LlmContentFilterError, OpenAiCompatibleLlmProvider } from "./OpenAiCompatibleLlmProvider.js";

function eventStream(...frames: readonly string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(new TextEncoder().encode(`data: ${frame}\n\n`));
        }
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

async function collect(
  provider: OpenAiCompatibleLlmProvider,
  extra: { readonly onUsage?: Parameters<OpenAiCompatibleLlmProvider["generate"]>[0]["onUsage"] } = {},
): Promise<string[]> {
  const chunks: string[] = [];
  for await (const text of provider.generate({
    messages: [{ role: "user", content: "Hallo." }],
    signal: new AbortController().signal,
    ...extra,
  })) chunks.push(text);
  return chunks;
}

describe("OpenAiCompatibleLlmProvider", () => {
  it("sends a key-header credential and provider-specific body fields when configured", async () => {
    let headers: Record<string, string> = {};
    let body: Record<string, unknown> = {};
    const provider = new OpenAiCompatibleLlmProvider({
      id: "azure-openai-v1",
      baseUrl: "https://example.openai.azure.com/openai/v1",
      model: "gpt-5",
      apiKey: "cloud-key",
      apiKeyHeader: "api-key",
      extraBody: { reasoning_effort: "minimal" },
      fetch: async (input, init) => {
        expect(input).toBe("https://example.openai.azure.com/openai/v1/chat/completions");
        headers = init?.headers as Record<string, string>;
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return eventStream('{"choices":[{"delta":{"content":"Hoi"}}]}', "[DONE]");
      },
    });

    expect(provider.id).toBe("azure-openai-v1");
    expect(await collect(provider)).toEqual(["Hoi"]);
    expect(headers["api-key"]).toBe("cloud-key");
    expect(headers).not.toHaveProperty("authorization");
    expect(body).toMatchObject({
      model: "gpt-5",
      stream: true,
      reasoning_effort: "minimal",
      response_format: { type: "json_object" },
    });
    expect(body).not.toHaveProperty("stream_options");
  });

  it("reports token usage, including reasoning tokens, only when a usage callback is given", async () => {
    let body: Record<string, unknown> = {};
    const provider = new OpenAiCompatibleLlmProvider({
      baseUrl: "https://example.openai.azure.com/openai/v1",
      model: "gpt-5",
      fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return eventStream(
          '{"choices":[],"prompt_filter_results":[{"prompt_index":0}]}',
          '{"choices":[{"delta":{"content":"Hoi"},"finish_reason":null}]}',
          '{"choices":[{"delta":{},"finish_reason":"stop"}]}',
          '{"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":48,"total_tokens":168,' +
            '"completion_tokens_details":{"reasoning_tokens":32}}}',
          "[DONE]",
        );
      },
    });
    const usage: unknown[] = [];

    expect(await collect(provider, { onUsage: (value) => usage.push(value) })).toEqual(["Hoi"]);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(usage).toEqual([
      { promptTokens: 120, completionTokens: 48, reasoningTokens: 32, totalTokens: 168 },
    ]);
  });

  it("reports content-filter blocks from the request or the stream as content-filter errors", async () => {
    const blockedPrompt = new OpenAiCompatibleLlmProvider({
      baseUrl: "https://example.openai.azure.com/openai/v1",
      model: "gpt-5",
      fetch: async () =>
        Response.json(
          {
            error: {
              code: "content_filter",
              message: "The response was filtered due to the prompt triggering a content management policy.",
            },
          },
          { status: 400 },
        ),
    });
    await expect(collect(blockedPrompt)).rejects.toBeInstanceOf(LlmContentFilterError);
    await expect(collect(blockedPrompt)).rejects.toThrow("content filter");

    const blockedResponse = new OpenAiCompatibleLlmProvider({
      baseUrl: "https://example.openai.azure.com/openai/v1",
      model: "gpt-5",
      fetch: async () =>
        eventStream(
          '{"choices":[],"prompt_filter_results":[{"prompt_index":0}]}',
          '{"choices":[{"delta":{"content":"{\\"text\\":"},"finish_reason":null}]}',
          '{"choices":[{"delta":{},"finish_reason":"content_filter"}]}',
          "[DONE]",
        ),
    });
    await expect(collect(blockedResponse)).rejects.toBeInstanceOf(LlmContentFilterError);
  });

  it("requests streamed completions with server credentials and trusted context", async () => {
    let requestBody: unknown;
    let requestHeaders: HeadersInit | undefined;
    const provider = new OpenAiCompatibleLlmProvider({
      baseUrl: "http://localhost:1234/v1/",
      model: "local-model",
      apiKey: "test-key",
      fetch: async (input, init) => {
        expect(input).toBe("http://localhost:1234/v1/chat/completions");
        requestHeaders = init?.headers;
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"Hallo "}}]}\n\n',
                ),
              );
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"daar."}}]}\n\n',
                ),
              );
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });

    const chunks = [];
    for await (const text of provider.generate({
      messages: [{ role: "user", content: "Hallo." }],
      appContext: {
        appId: "mail",
        appName: "Mail",
        category: "Productivity",
      },
      availableActions: [
        {
          id: "mail.send",
          description: "Send a message.",
          risk: "external-effect",
          requiresConfirmation: true,
          confirmationPhrase: "confirm send",
          inputSchema: {
            type: "object",
            properties: { to: { type: "string" } },
            required: ["to"],
            additionalProperties: false,
          },
        },
      ],
      signal: new AbortController().signal,
    })) {
      chunks.push(text);
    }

    expect(chunks).toEqual(["Hallo ", "daar."]);
    expect(requestHeaders).toMatchObject({
      authorization: "Bearer test-key",
      accept: "text/event-stream",
    });
    expect(requestBody).toMatchObject({
      model: "local-model",
      stream: true,
      response_format: { type: "json_object" },
      messages: [
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Current trusted Sodalis app: Mail"),
        }),
        { role: "user", content: "Hallo." },
      ],
    });
    expect(JSON.stringify(requestBody)).toContain("mail.send");
    expect(Object.keys(requestBody as object).sort()).toEqual([
      "messages",
      "model",
      "response_format",
      "stream",
    ]);
  });

  it("surfaces provider failures and rejects non-stream responses", async () => {
    const failure = new OpenAiCompatibleLlmProvider({
      baseUrl: "http://localhost/v1",
      model: "missing",
      fetch: async () =>
        Response.json(
          { error: { message: "Model is not loaded." } },
          { status: 503 },
        ),
    });
    await expect(async () => {
      for await (const _text of failure.generate({
        messages: [{ role: "user", content: "Hello" }],
        signal: new AbortController().signal,
      })) {
        // Provider errors must reach the conversation state.
      }
    }).rejects.toThrow("Model is not loaded.");

    const nonStream = new OpenAiCompatibleLlmProvider({
      baseUrl: "http://localhost/v1",
      model: "local",
      fetch: async () => Response.json({ choices: [] }),
    });
    await expect(async () => {
      for await (const _text of nonStream.generate({
        messages: [{ role: "user", content: "Hello" }],
        signal: new AbortController().signal,
      })) {
        // A completed non-stream response is not valid for this adapter.
      }
    }).rejects.toThrow("unsupported response format");
  });
});
