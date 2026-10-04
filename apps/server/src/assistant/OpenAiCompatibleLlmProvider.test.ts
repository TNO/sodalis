import { describe, expect, it } from "vitest";
import { OpenAiCompatibleLlmProvider } from "./OpenAiCompatibleLlmProvider.js";

describe("OpenAiCompatibleLlmProvider", () => {
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
