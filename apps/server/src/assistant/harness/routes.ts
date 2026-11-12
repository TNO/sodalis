import type { Context, Hono } from "hono";
import { BodyLimitError, ID_PATTERN, isRecord, MAX_MESSAGE_LENGTH, readBoundedBody, readMessages } from "../requestBody.js";
import type { CompanionWorkflows, WorkflowEvent } from "./workflow.js";

/**
 * The Pi workflow transport: an SSE lifecycle stream per workflow, plus
 * separate steer and cancel requests (steering cannot travel back over SSE).
 */

type ErrorStatus = 400 | 404 | 409 | 413 | 415 | 503;

function errorResponse(context: Context, message: string, status: ErrorStatus) {
  return context.json({ error: message }, status);
}

/** The parsed JSON object body, or an error response. */
async function readJsonObject(context: Context): Promise<Record<string, unknown> | Response> {
  if ((context.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase() !== "application/json") {
    return errorResponse(context, "Request content type must be application/json.", 415);
  }
  let raw: Uint8Array;
  try {
    raw = await readBoundedBody(context.req.raw);
  } catch (error) {
    if (error instanceof BodyLimitError) return errorResponse(context, error.message, 413);
    throw error;
  }
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(raw));
    return isRecord(payload) ? payload : errorResponse(context, "Request body must be a JSON object.", 400);
  } catch {
    return errorResponse(context, "Request body must be valid JSON.", 400);
  }
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function registerWorkflowRoutes(
  app: Hono,
  workflows: CompanionWorkflows,
): void {
  app.post("/api/assistant/workflows", async (context) => {
    const payload = await readJsonObject(context);
    if (payload instanceof Response) return payload;
    const messages = readMessages(payload.messages);
    const { sessionId, workflowId, inputId } = payload;
    if (!isId(sessionId) || !isId(workflowId) || !isId(inputId) || !messages) {
      return errorResponse(context, "Workflow request is invalid.", 400);
    }

    const encoder = new TextEncoder();
    const disconnect = new AbortController();
    const requestSignal = context.req.raw.signal;
    const onRequestAbort = () => disconnect.abort();
    requestSignal.addEventListener("abort", onRequestAbort, { once: true });
    const workflowSignal = AbortSignal.any([disconnect.signal, requestSignal]);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let closed = false;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
      cancel() {
        closed = true;
        disconnect.abort();
      },
    });
    const send = (event: WorkflowEvent) => {
      if (closed) return;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      if (event.type !== "started") {
        closed = true;
        controller.close();
        requestSignal.removeEventListener("abort", onRequestAbort);
      }
    };
    const result = workflows.start(
      {
        sessionId,
        workflowId,
        inputId,
        messages,
      },
      { signal: workflowSignal, onEvent: send },
    );
    if (result.status !== "started") {
      requestSignal.removeEventListener("abort", onRequestAbort);
      return result.status === "conflict"
        ? errorResponse(context, "A workflow is already running for this conversation.", 409)
        : errorResponse(context, "Assistant is at capacity.", 503);
    }
    if (workflowSignal.aborted) disconnect.abort();
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-sodalis-session-id": sessionId,
        "x-sodalis-workflow-id": workflowId,
      },
    });
  });

  app.post("/api/assistant/workflows/:workflowId/steer", async (context) => {
    const workflowId = context.req.param("workflowId");
    const payload = await readJsonObject(context);
    if (payload instanceof Response) return payload;
    const { inputId, text } = payload;
    if (
      !isId(workflowId) ||
      !isId(inputId) ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > MAX_MESSAGE_LENGTH
    ) {
      return errorResponse(context, "Steering request is invalid.", 400);
    }
    const status = workflows.steer(workflowId, inputId, text.trim());
    return context.json({ status }, status === "accepted" || status === "duplicate" ? 202 : 409);
  });

  app.post("/api/assistant/workflows/:workflowId/cancel", (context) => {
    const workflowId = context.req.param("workflowId");
    if (!isId(workflowId)) return errorResponse(context, "Cancel request is invalid.", 400);
    const status = workflows.cancel(workflowId);
    return context.json({ status }, status === "cancelled" ? 200 : 409);
  });
}
