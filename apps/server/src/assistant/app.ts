import { Hono, type Context } from "hono";
import type {
  AppActionInputProperty,
  AppActionInputSchema,
  AppActionRisk,
  AvailableAppAction,
  AssistantAppContext,
  ConversationMessage,
} from "@sodalis/assistant";
import { formatRecallResult, type MemoryService } from "@sodalis/memory";
import { registerMemoryRoutes } from "./memoryRoutes.js";
import type {
  LlmGenerationRequest,
  LlmTextGenerationProvider,
} from "./OpenAiCompatibleLlmProvider.js";

interface AssistantAppOptions {
  readonly provider?: LlmTextGenerationProvider;
  readonly maxConcurrentRequests?: number;
  /** Long-term memory; omit to switch memory off. */
  readonly memory?: MemoryService;
  /** Sources allowed to post observations to `/api/memory/observations`. */
  readonly observationSources?: readonly string[];
}

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_MESSAGES = 13;
const MAX_AVAILABLE_ACTIONS = 32;
const MAX_ACTION_DESCRIPTION = 1_000;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_CONTEXT_TEXT = 160;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ACTION_RISKS = [
  "read",
  "navigate",
  "draft",
  "safe-control",
  "external-effect",
  "destructive",
] as const satisfies readonly AppActionRisk[];

class BodyLimitError extends Error {}

const RECALL_PREFIX = '{"recall_memory"';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface RecallCall {
  readonly query: string;
  readonly from?: string;
  readonly to?: string;
}

function readRecallCall(text: string): RecallCall | undefined {
  try {
    const payload: unknown = JSON.parse(text);
    if (!isRecord(payload) || !isRecord(payload.recall_memory)) return undefined;
    const call = payload.recall_memory;
    if (typeof call.query !== "string" || call.query.length > 500) return undefined;
    return {
      query: call.query,
      ...(typeof call.from === "string" && DATE_PATTERN.test(call.from) ? { from: call.from } : {}),
      ...(typeof call.to === "string" && DATE_PATTERN.test(call.to) ? { to: call.to } : {}),
    };
  } catch {
    return undefined;
  }
}

/**
 * Generates one reply. With memory, the model may first answer with a
 * `recall_memory` request; the start of the stream is held back until that is
 * ruled out, and a recall triggers a second generation with the excerpts.
 */
async function* generateReply(
  provider: LlmTextGenerationProvider,
  request: LlmGenerationRequest,
  memory: MemoryService | undefined,
): AsyncIterable<string> {
  if (!memory) {
    yield* provider.generate(request);
    return;
  }
  let buffer = "";
  let streaming = false;
  for await (const delta of provider.generate({ ...request, recallAvailable: true })) {
    if (streaming) {
      yield delta;
      continue;
    }
    buffer += delta;
    const compact = buffer.replace(/\s+/g, "");
    if (RECALL_PREFIX.startsWith(compact) || compact.startsWith(RECALL_PREFIX)) continue;
    streaming = true;
    yield buffer;
  }
  if (streaming) return;
  if (!buffer.replace(/\s+/g, "").startsWith(RECALL_PREFIX)) {
    if (buffer) yield buffer;
    return;
  }
  const call = readRecallCall(buffer);
  const result = call?.query.trim()
    ? await memory.recall({ ...call, signal: request.signal })
    : { excerpts: [] };
  request.signal.throwIfAborted();
  yield* provider.generate({
    ...request,
    recallAvailable: false,
    recalledContext: { query: call?.query ?? "", excerpts: formatRecallResult(result) },
  });
}

/** The caption text of a JSON utterance, or the raw reply when it is not JSON. */
function utteranceText(reply: string): string {
  try {
    const payload: unknown = JSON.parse(reply);
    if (isRecord(payload) && typeof payload.text === "string") return payload.text;
  } catch {
    // Not a JSON utterance; keep the raw text.
  }
  return reply;
}

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

function readAvailableActions(
  value: unknown,
): AvailableAppAction[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_AVAILABLE_ACTIONS) {
    return null;
  }
  const actions: AvailableAppAction[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !ID_PATTERN.test(item.id) ||
      ids.has(item.id) ||
      typeof item.description !== "string" ||
      !item.description.trim() ||
      item.description.length > MAX_ACTION_DESCRIPTION ||
      !ACTION_RISKS.includes(item.risk as AppActionRisk) ||
      typeof item.requiresConfirmation !== "boolean" ||
      !isRecord(item.inputSchema) ||
      item.inputSchema.type !== "object" ||
      !isRecord(item.inputSchema.properties) ||
      Object.keys(item.inputSchema.properties).length > 64
    ) {
      return null;
    }
    const properties = Object.create(null) as Record<
      string,
      AppActionInputProperty
    >;
    for (const [name, property] of Object.entries(item.inputSchema.properties)) {
      if (
        !isRecord(property) ||
        !["string", "number", "boolean"].includes(String(property.type)) ||
        (property.description !== undefined &&
          (typeof property.description !== "string" ||
            property.description.length > MAX_ACTION_DESCRIPTION)) ||
        (property.maxLength !== undefined &&
          (typeof property.maxLength !== "number" ||
            !Number.isInteger(property.maxLength) ||
            property.maxLength < 0)) ||
        (property.enum !== undefined &&
          (!Array.isArray(property.enum) ||
            property.enum.length > 32 ||
            !property.enum.every(
              (entry) =>
                typeof entry === "string" ||
                typeof entry === "boolean" ||
                (typeof entry === "number" && Number.isFinite(entry)),
            )))
      ) {
        return null;
      }
      properties[name] = {
        type: property.type as AppActionInputProperty["type"],
        ...(typeof property.description === "string"
          ? { description: property.description }
          : {}),
        ...(typeof property.maxLength === "number"
          ? { maxLength: property.maxLength }
          : {}),
        ...(Array.isArray(property.enum)
          ? { enum: property.enum as AppActionInputProperty["enum"] }
          : {}),
      };
    }
    const required = item.inputSchema.required;
    if (
      (required !== undefined &&
        (!Array.isArray(required) ||
          required.length > 64 ||
          !required.every(
            (field) =>
              typeof field === "string" &&
              Object.hasOwn(properties, field),
          ))) ||
      (item.inputSchema.additionalProperties !== undefined &&
        typeof item.inputSchema.additionalProperties !== "boolean") ||
      (item.confirmationPhrase !== undefined &&
        (typeof item.confirmationPhrase !== "string" ||
          item.confirmationPhrase.length > 100))
    ) {
      return null;
    }
    ids.add(item.id);
    const risk = item.risk as AppActionRisk;
    actions.push({
      id: item.id,
      description: item.description,
      risk,
      requiresConfirmation:
        item.requiresConfirmation ||
        risk === "external-effect" ||
        risk === "destructive",
      inputSchema: {
        type: "object",
        properties,
        ...(Array.isArray(required)
          ? { required: required as string[] }
          : {}),
        ...(typeof item.inputSchema.additionalProperties === "boolean"
          ? { additionalProperties: item.inputSchema.additionalProperties }
          : {}),
      } satisfies AppActionInputSchema,
      ...(typeof item.confirmationPhrase === "string"
        ? { confirmationPhrase: item.confirmationPhrase }
        : {}),
    });
  }
  return actions;
}

export function createAssistantApp(options: AssistantAppOptions = {}) {
  const maxConcurrentRequests = options.maxConcurrentRequests ?? 4;
  if (!Number.isInteger(maxConcurrentRequests) || maxConcurrentRequests < 1) {
    throw new RangeError("Assistant concurrency must be a positive integer.");
  }
  let activeRequests = 0;
  const app = new Hono();
  app.get("/healthz", (context) =>
    context.json({ status: "ok", service: "ai" }),
  );
  app.get("/readyz", (context) =>
    options.provider
      ? context.json({ status: "ready", service: "ai" })
      : errorResponse(context, "LLM is not configured.", 503),
  );

  if (options.memory) {
    registerMemoryRoutes(app, {
      memory: options.memory,
      ...(options.observationSources ? { observationSources: options.observationSources } : {}),
    });
  }

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
    const availableActions = readAvailableActions(payload.availableActions);
    if (
      typeof sessionId !== "string" ||
      !ID_PATTERN.test(sessionId) ||
      typeof turnId !== "string" ||
      !ID_PATTERN.test(turnId) ||
      !messages ||
      appContext === null ||
      availableActions === null
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
    const memory = options.memory;
    const body = new ReadableStream<Uint8Array>({
      async start(streamController) {
        const encoder = new TextEncoder();
        let sequence = 0;
        let reply = "";
        try {
          let memoryContext = "";
          if (memory?.active()) {
            const userText = messages.at(-1)!.content;
            const previous = messages.at(-2);
            try {
              memory.recordUserTurn({ sessionId, turnId, text: userText });
              memoryContext = (
                await memory.retrieve(
                  userText,
                  previous?.role === "assistant" ? utteranceText(previous.content) : undefined,
                  abortController.signal,
                )
              ).block;
            } catch (error) {
              abortController.signal.throwIfAborted();
              console.error(`Memory retrieval failed for "${sessionId}/${turnId}":`, error);
            }
          }
          for await (const text of generateReply(
            provider,
            {
              messages,
              ...(appContext ? { appContext } : {}),
              ...(availableActions ? { availableActions } : {}),
              ...(memoryContext ? { memoryContext } : {}),
              signal: abortController.signal,
            },
            memory?.active() ? memory : undefined,
          )) {
            abortController.signal.throwIfAborted();
            if (!text) continue;
            reply += text;
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
          if (!abortController.signal.aborted) {
            streamController.close();
            if (memory && reply) {
              try {
                memory.recordAssistantTurn({ sessionId, turnId, text: utteranceText(reply) });
              } catch (error) {
                console.error(`Memory recording failed for "${sessionId}/${turnId}":`, error);
              }
            }
          }
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
          memory?.flush();
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
