import type { Hono, Context } from "hono";
import {
  CONSENT_KINDS,
  ITEM_LAYERS,
  ITEM_STATUSES,
  RETENTIONS,
  type ConsentKind,
  type ItemLayer,
  type ItemStatus,
  type MemoryItem,
  type MemoryService,
  type Retention,
} from "@sodalis/memory";

const MAX_BODY = 64 * 1024;
const MAX_TEXT = 2_000;
const MAX_OBSERVATION = 4_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface MemoryRoutesOptions {
  readonly memory: MemoryService;
  /** Observation sources that may post events, such as `home` or `app:calendar`. */
  readonly observationSources?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(context: Context): Promise<Record<string, unknown> | undefined> {
  if ((context.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase() !== "application/json") {
    return undefined;
  }
  const text = await context.req.text();
  if (text.length > MAX_BODY) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function itemView(item: MemoryItem) {
  return {
    id: item.id,
    layer: item.layer,
    subject: item.subject,
    text: item.text,
    status: item.status,
    provenance: item.provenance,
    sensitivity: item.sensitivity,
    eventAt: item.eventAt ?? null,
    validFrom: item.validFrom,
    validTo: item.validTo ?? null,
    revision: item.revision,
    confidence: item.confidence,
  };
}

function readId(context: Context): number | undefined {
  const id = Number(context.req.param("id"));
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function readLimit(value: string | undefined, fallback: number, max: number): number {
  const limit = Number(value ?? fallback);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, max) : fallback;
}

/**
 * The memory inspection and control API (task 0047) and observation intake
 * (task 0052). Mounted on the AI service under `/api/memory`.
 */
export function registerMemoryRoutes(app: Hono, options: MemoryRoutesOptions): void {
  const service = options.memory;
  const store = service.store;
  const sources = new Set(options.observationSources ?? ["home"]);

  app.get("/api/memory/status", (context) =>
    context.json({
      active: service.active(),
      consent: Object.fromEntries(
        CONSENT_KINDS.map((kind) => {
          const record = store.consent(kind);
          return [kind, record ? { granted: record.granted, at: record.recordedAt, policyVersion: record.policyVersion } : null];
        }),
      ),
      retention: store.getRetention(),
      turns: store.countTurns(),
      items: store.listItems({ statuses: ["active"], limit: 100_000 }).length,
      pendingJobs: service.queue.pendingCount(),
      failedJobs: service.queue.failedJobs().length,
    }),
  );

  app.put("/api/memory/consent", async (context) => {
    const body = await readJson(context);
    const kind = body?.kind;
    if (
      !body ||
      typeof kind !== "string" ||
      !(CONSENT_KINDS as readonly string[]).includes(kind) ||
      typeof body.granted !== "boolean" ||
      (body.policyVersion !== undefined && (typeof body.policyVersion !== "string" || body.policyVersion.length > 64))
    ) {
      return context.json({ error: "Consent requires kind (memory or health) and granted." }, 400);
    }
    const record = store.recordConsent(kind as ConsentKind, body.granted, (body.policyVersion as string | undefined) ?? "1");
    return context.json({ kind: record.kind, granted: record.granted, at: record.recordedAt });
  });

  app.put("/api/memory/retention", async (context) => {
    const body = await readJson(context);
    if (!body || typeof body.retention !== "string" || !(RETENTIONS as readonly string[]).includes(body.retention)) {
      return context.json({ error: `Retention must be one of ${RETENTIONS.join(", ")}.` }, 400);
    }
    store.setRetention(body.retention as Retention);
    const purged = store.purgeExpiredTurns();
    return context.json({ retention: store.getRetention(), purgedTurns: purged });
  });

  app.get("/api/memory/items", (context) => {
    const layer = context.req.query("layer");
    const status = context.req.query("status") ?? "active";
    if (
      (layer !== undefined && !(ITEM_LAYERS as readonly string[]).includes(layer)) ||
      (status !== "all" && !(ITEM_STATUSES as readonly string[]).includes(status))
    ) {
      return context.json({ error: "Unknown layer or status." }, 400);
    }
    const subject = context.req.query("subject");
    const items = store.listItems({
      ...(layer ? { layers: [layer as ItemLayer] } : {}),
      ...(status === "all" ? {} : { statuses: [status as ItemStatus] }),
      ...(subject ? { subject } : {}),
      limit: readLimit(context.req.query("limit"), 100, 500),
      offset: readLimit(context.req.query("offset"), 0, 1_000_000) || 0,
    });
    return context.json({ items: items.map(itemView) });
  });

  app.get("/api/memory/search", async (context) => {
    const query = context.req.query("q")?.trim();
    if (!query || query.length > MAX_TEXT) return context.json({ error: "Search requires q." }, 400);
    const results = await service.memory.search(query, { limit: readLimit(context.req.query("limit"), 10, 50) });
    return context.json({
      items: results.map(({ item, hit }) => ({ ...itemView(item), score: hit.score })),
    });
  });

  /** What Sodalis knows about a person or topic, with provenance and history. */
  app.get("/api/memory/about", async (context) => {
    const topic = context.req.query("q")?.trim();
    if (!topic || topic.length > 200) return context.json({ error: "About requires q." }, 400);
    const bySubject = store.listItems({ subject: topic, statuses: ["active"], limit: 50 });
    const related = (await service.memory.search(topic, { limit: 10 })).filter(
      ({ hit, item }) => item.status === "active" && ((hit.similarity ?? 0) >= 0.35 || hit.textRank !== undefined),
    );
    const seen = new Set<number>();
    const items = [...bySubject, ...related.map(({ item }) => item)].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return context.json({
      topic,
      items: items.map((item) => ({
        ...itemView(item),
        history: store.supersededChain(item.id).map(itemView),
        sources: store.sourceTurns(item.id).map((turn) => ({
          role: turn.role,
          source: turn.source ?? null,
          at: turn.createdAt,
        })),
      })),
    });
  });

  app.get("/api/memory/items/:id", (context) => {
    const id = readId(context);
    const item = id === undefined ? undefined : store.getItem(id);
    if (!item) return context.json({ error: "Memory item not found." }, 404);
    return context.json({
      item: itemView(item),
      revisions: store.revisions(item.id),
      history: store.supersededChain(item.id).map(itemView),
      supersededBy: store.supersededBy(item.id)?.id ?? null,
      sources: store.sourceTurns(item.id).map((turn) => ({ id: turn.id, role: turn.role, source: turn.source ?? null, at: turn.createdAt, text: turn.text })),
      evidence: store.evidenceItemIds(item.id),
    });
  });

  /** A user correction: a new revision of the same item. */
  app.patch("/api/memory/items/:id", async (context) => {
    const id = readId(context);
    const body = await readJson(context);
    const item = id === undefined ? undefined : store.getItem(id);
    if (!item) return context.json({ error: "Memory item not found." }, 404);
    if (item.status !== "active") return context.json({ error: "Only active items can be corrected." }, 409);
    const text = body?.text;
    const eventAt = body?.eventAt;
    if (
      !body ||
      (text !== undefined && (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT)) ||
      (eventAt !== undefined && eventAt !== null && (typeof eventAt !== "string" || !DATE.test(eventAt))) ||
      (text === undefined && eventAt === undefined)
    ) {
      return context.json({ error: "A correction needs text and/or eventAt (YYYY-MM-DD or null)." }, 400);
    }
    const updated = await service.memory.updateItem(item.id, {
      ...(typeof text === "string" ? { text: text.trim() } : {}),
      ...(eventAt !== undefined ? { eventAt: eventAt as string | null } : {}),
      reason: "user-correction",
    });
    return context.json({ item: itemView(updated) });
  });

  app.delete("/api/memory/items/:id", (context) => {
    const id = readId(context);
    if (id === undefined || !service.memory.deleteItem(id, "user")) {
      return context.json({ error: "Memory item not found." }, 404);
    }
    return context.body(null, 204);
  });

  app.delete("/api/memory/transcripts", (context) => {
    const sessionId = context.req.query("sessionId");
    const deleted = store.deleteTranscripts(sessionId ? { sessionId } : {});
    return context.json({ deletedTurns: deleted });
  });

  app.post("/api/memory/observations", async (context) => {
    const body = await readJson(context);
    const source = body?.source;
    const text = body?.text;
    if (
      !body ||
      typeof source !== "string" ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > MAX_OBSERVATION ||
      (body.eventId !== undefined && (typeof body.eventId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(body.eventId)))
    ) {
      return context.json({ error: "An observation needs source and text." }, 400);
    }
    if (!sources.has(source)) return context.json({ error: "Observation source is not allowed." }, 403);
    if (!service.active()) return context.json({ stored: false }, 202);
    const turn = service.recordObservation({
      source,
      text: text.trim(),
      ...(typeof body.eventId === "string" ? { eventId: body.eventId } : {}),
    });
    service.flush();
    return context.json({ stored: Boolean(turn), id: turn?.id ?? null }, 202);
  });
}
