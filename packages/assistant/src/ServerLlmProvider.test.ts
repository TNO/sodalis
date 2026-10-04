import { describe, expect, it, vi } from "vitest";
import { ServerLlmProvider } from "./ServerLlmProvider.js";
import type { LlmStreamRequest } from "./index.js";

const request: LlmStreamRequest = {
  sessionId: "session-1",
  turnId: "turn-1",
  messages: [{ role: "user", content: "Help me." }],
  appContext: { appId: "mail", appName: "Mail" },
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
};

function response(
  body: ReadableStream<Uint8Array>,
  sessionId = request.sessionId,
  turnId = request.turnId,
): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "x-sodalis-session-id": sessionId,
      "x-sodalis-turn-id": turnId,
    },
  });
}

describe("ServerLlmProvider", () => {
  it("streams sequenced deltas and reports first-token latency", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"sessionId":"session-1","turnId":"turn-1","sequence":0,"text":"Goed"}\n\n',
              ),
            );
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"sessionId":"session-1","turnId":"turn-1","sequence":1,"text":"emorgen"}\n\n',
              ),
            );
            controller.close();
          },
        }),
      ),
    );
    const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(35);
    const onLatency = vi.fn();
    const provider = new ServerLlmProvider({
      baseUrl: "/api/",
      fetch: fetcher,
      now,
      onLatency,
    });
    const deltas = [];

    for await (const delta of provider.stream(request)) deltas.push(delta);

    expect(fetcher).toHaveBeenCalledWith(
      "/api/assistant/turns",
      expect.objectContaining({
        method: "POST",
        signal: request.signal,
      }),
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      sessionId: "session-1",
      turnId: "turn-1",
      messages: request.messages,
      appContext: request.appContext,
      availableActions: request.availableActions,
    });
    expect(deltas).toEqual([
      {
        sessionId: "session-1",
        turnId: "turn-1",
        sequence: 0,
        text: "Goed",
      },
      {
        sessionId: "session-1",
        turnId: "turn-1",
        sequence: 1,
        text: "emorgen",
      },
    ]);
    expect(onLatency).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
      type: "request-to-first-token",
      latencyMs: 25,
    });
  });

  it("rejects mismatched IDs and aborts a pending stream", async () => {
    const mismatch = new ServerLlmProvider({
      fetch: async () =>
        response(new ReadableStream<Uint8Array>(), request.sessionId, "old"),
    });
    await expect(async () => {
      for await (const _delta of mismatch.stream(request)) {
        // A mismatched turn must be rejected before streaming.
      }
    }).rejects.toThrow("mismatched turn ID");

    const abortController = new AbortController();
    let cancelled = false;
    let markReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    const pending = new ServerLlmProvider({
      fetch: async () =>
        response(
          new ReadableStream<Uint8Array>({
            pull() {
              markReadStarted();
              return new Promise<void>(() => undefined);
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
    });
    const consuming = (async () => {
      for await (const _delta of pending.stream({
        ...request,
        signal: abortController.signal,
      })) {
        // Continue until cancellation interrupts the fetch stream.
      }
    })();
    await readStarted;
    abortController.abort(new Error("Turn cancelled."));

    await expect(consuming).rejects.toThrow("Turn cancelled.");
    expect(cancelled).toBe(true);
  });
});
