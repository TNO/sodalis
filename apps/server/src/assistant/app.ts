import { Hono, type Context } from "hono";
import type {
  AssistantAppContext,
  ConversationMessage,
} from "@sodalis/assistant";
import type { LlmTextGenerationProvider } from "./OpenAiCompatibleLlmProvider.js";

interface AssistantAppOptions {
  readonly provider?: LlmTextGenerationProvider;
  readonly maxConcurrentRequests?: number;
}

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_MESSAGES = 13;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_CONTEXT_TEXT = 160;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

class BodyLimitError extends Error {}

function errorResponse(
  context: Context,
  message: string,
  status: 400 | 413 | 415 | 503,
) {
  return context.json({ error: message }, status);
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new BodyLimitError("Assistant request exceeds the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMessages(value: unknown): ConversationMessage[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MESSAGES) {
    return undefined;
  }
  const messages: ConversationMessage[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > MAX_MESSAGE_LENGTH
    ) {
      return undefined;
    }
    messages.push({ role: item.role, content: item.content });
  }
  if (messages.at(-1)?.role !== "user") return undefined;
  return messages;
}

function readAppContext(value: unknown): AssistantAppContext | undefined | null {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value.appId !== "string" ||
    !ID_PATTERN.test(value.appId) ||
    typeof value.appName !== "string" ||
    !value.appName.trim() ||
    value.appName.length > MAX_CONTEXT_TEXT ||
    (value.category !== undefined &&
      (typeof value.category !== "string" ||
        value.category.length > MAX_CONTEXT_TEXT))
  ) {
    return null;
  }
  return {
    appId: value.appId,
    appName: value.appName,
    ...(typeof value.category === "string"
      ? { category: value.category }
      : {}),
  };
}

export function createAssistantApp(options: AssistantAppOptions = {}) {
  const maxConcurrentRequests = options.maxConcurrentRequests ?? 4;
  if (!Number.isInteger(maxConcurrentRequests) || maxConcurrentRequests < 1) {
    throw new RangeError("Assistant concurrency must be a positive integer.");
  }
  let activeRequests = 0;
  const app = new Hono();

  app.post("/api/assistant/turns", async (context) => {
    const provider = options.provider;
    if (!provider) return errorResponse(context, "LLM is not configured.", 503);
    if (
      (context.req.header("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    ) {
      return errorResponse(
        context,
        "Request content type must be application/json.",
        415,
      );
    }

    let rawBody: Uint8Array;
    try {
      rawBody = await readBoundedBody(context.req.raw);
    } catch (error) {
      if (error instanceof BodyLimitError) {
        return errorResponse(context, error.message, 413);
      }
      throw error;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return errorResponse(context, "Request body must be valid JSON.", 400);
    }
    if (!isRecord(payload)) {
      return errorResponse(context, "Assistant turn is required.", 400);
    }
    const sessionId = payload.sessionId;
    const turnId = payload.turnId;
    const messages = readMessages(payload.messages);
    const appContext = readAppContext(payload.appContext);
    if (
      typeof sessionId !== "string" ||
      !ID_PATTERN.test(sessionId) ||
      typeof turnId !== "string" ||
      !ID_PATTERN.test(turnId) ||
      !messages ||
      appContext === null
    ) {
      return errorResponse(context, "Assistant turn is invalid.", 400);
    }
    if (activeRequests >= maxConcurrentRequests) {
      return errorResponse(context, "Assistant is at capacity.", 503);
    }

    const abortController = new AbortController();
    const requestSignal = context.req.raw.signal;
    const onRequestAbort = () =>
      abortController.abort(
        requestSignal.reason ??
          new DOMException("Assistant turn cancelled.", "AbortError"),
      );
    requestSignal.addEventListener("abort", onRequestAbort, { once: true });
    if (requestSignal.aborted) onRequestAbort();
    activeRequests += 1;
    const body = new ReadableStream<Uint8Array>({
      async start(streamController) {
        const encoder = new TextEncoder();
        let sequence = 0;
        try {
          for await (const text of provider.generate({
            messages,
            ...(appContext ? { appContext } : {}),
            signal: abortController.signal,
          })) {
            abortController.signal.throwIfAborted();
            if (!text) continue;
            streamController.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  sessionId,
                  turnId,
                  sequence: sequence++,
                  text,
                })}\n\n`,
              ),
            );
          }
          if (!abortController.signal.aborted) streamController.close();
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error(
              `Assistant generation failed for "${sessionId}/${turnId}":`,
              error,
            );
            streamController.error(error);
          }
        } finally {
          requestSignal.removeEventListener("abort", onRequestAbort);
          activeRequests -= 1;
        }
      },
      cancel(reason) {
        abortController.abort(
          reason ??
            new DOMException("Assistant stream cancelled.", "AbortError"),
        );
      },
    });

    return new Response(body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-sodalis-session-id": sessionId,
        "x-sodalis-turn-id": turnId,
      },
    });
  });

  app.onError((error, context) => {
    console.error("Assistant API request failed:", error);
    return context.json({ error: "Assistant API request failed." }, 500);
  });
  return app;
}
