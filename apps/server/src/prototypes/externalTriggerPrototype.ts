import { Hono } from "hono";

interface DemoButtonEvent {
  readonly id: string;
  readonly type: "demo_button_pressed";
  readonly entityDomain: "event";
  readonly entityClass: "button";
  readonly source: "stand-in" | "mock-ha";
  readonly attemptId?: string;
  readonly firedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const encoder = new TextEncoder();
const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
const heartbeatTimers = new Map<ReadableStreamDefaultController<Uint8Array>, ReturnType<typeof setInterval>>();
let nextEventId = 0;

function encodedSse(eventName: string, data: unknown, id?: string): Uint8Array {
  return encoder.encode(
    `${id ? `id: ${id}\n` : ""}event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

function removeSubscriber(controller: ReadableStreamDefaultController<Uint8Array>): void {
  subscribers.delete(controller);
  const timer = heartbeatTimers.get(controller);
  if (timer) clearInterval(timer);
  heartbeatTimers.delete(controller);
  console.log(`[external-trigger] browser disconnected at ${new Date().toISOString()}`);
}

export function createExternalTriggerPrototypeApp() {
  const app = new Hono();

  app.get("/healthz", (context) =>
    context.json({ status: "ok", prototype: "external-trigger" }),
  );

  app.get("/api/prototype/external-trigger/clock", (context) =>
    context.json({ serverTime: Date.now() }),
  );

  app.get("/api/prototype/external-trigger/events", (context) => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        subscribers.add(controller);
        const lastEventId = context.req.header("last-event-id") ?? "none";
        console.log(
          `[external-trigger] browser connected at ${new Date().toISOString()} lastEventId=${lastEventId}`,
        );
        controller.enqueue(
          encoder.encode(`retry: 1000\nevent: connected\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`),
        );
        const timer = setInterval(() => {
          try {
            controller.enqueue(encodedSse("heartbeat", { at: new Date().toISOString() }));
          } catch {
            removeSubscriber(controller);
          }
        }, 5_000);
        heartbeatTimers.set(controller, timer);
      },
      cancel() {
        if (streamController) removeSubscriber(streamController);
      },
    });

    return context.newResponse(stream, 200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
  });

  app.post("/api/prototype/external-trigger/mock-event", async (context) => {
    const payload: unknown = await context.req.json().catch(() => undefined);
    if (!isRecord(payload) ||
        Object.keys(payload).some((key) => key !== "source" && key !== "attemptId") ||
        (payload.source !== "stand-in" && payload.source !== "mock-ha") ||
        (payload.attemptId !== undefined &&
          (typeof payload.attemptId !== "string" || payload.attemptId.length > 100))) {
      return context.json({ error: "A supported local demo-button source is required." }, 400);
    }

    const event: DemoButtonEvent = {
      id: String(++nextEventId),
      type: "demo_button_pressed",
      entityDomain: "event",
      entityClass: "button",
      source: payload.source,
      ...(typeof payload.attemptId === "string" ? { attemptId: payload.attemptId } : {}),
      firedAt: new Date().toISOString(),
    };
    const message = encodedSse(event.type, event, event.id);
    for (const subscriber of subscribers) {
      try {
        subscriber.enqueue(message);
      } catch {
        removeSubscriber(subscriber);
      }
    }
    console.log(`[external-trigger] ${JSON.stringify(event)}`);
    return context.json({ accepted: true, eventId: event.id, firedAt: event.firedAt }, 202);
  });

  return app;
}
