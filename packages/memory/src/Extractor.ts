import { parseJsonObject, type ChatClient } from "./ChatClient.js";
import type { MemoryKind } from "./DecisionGate.js";
import type { Sensitivity } from "./types.js";

export const EXTRACTED_LAYERS = ["L0", "L2", "L3", "L4", "L7"] as const;
export type ExtractedLayer = (typeof EXTRACTED_LAYERS)[number];

export interface ExtractedItem {
  readonly layer: ExtractedLayer;
  readonly subject: string;
  readonly text: string;
  readonly eventAt?: string;
  readonly sensitivity: Sensitivity;
  readonly provenance: "stated" | "inferred";
  readonly transient: boolean;
}

export interface ExtractionRequest {
  readonly userTurn: string;
  readonly previousAssistantTurn?: string;
  /** ISO time of the user turn; the only anchor for relative dates. */
  readonly turnTime: string;
  readonly kindHint?: MemoryKind;
  readonly isCorrection?: boolean;
  readonly signal?: AbortSignal;
}

export interface Extractor {
  readonly id: string;
  extract(request: ExtractionRequest): Promise<ExtractedItem[]>;
}

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["layer", "subject", "text", "event_at", "sensitivity", "provenance", "transient"],
        properties: {
          layer: { type: "string", enum: [...EXTRACTED_LAYERS] },
          subject: { type: "string" },
          text: { type: "string" },
          event_at: { type: ["string", "null"] },
          sensitivity: { type: "string", enum: ["general", "health"] },
          provenance: { type: "string", enum: ["stated", "inferred"] },
          transient: { type: "boolean" },
        },
      },
    },
  },
} as const;

/*
 * Adapted from Hy-Memory's extractor prompt (hy_memory/agent/extractor.py,
 * EXTRACT_SYSTEM_PROMPT; Tencent-Hunyuan/Hy-Memory, Apache-2.0) for a personal
 * companion: Sodalis layers, Dutch and English, dates, and health sensitivity.
 */
export const EXTRACTION_SYSTEM_PROMPT = `# ROLE
You are the memory extractor of Sodalis, a personal companion for (older) adults.
Extract durable, high-value memories from the user's latest message and return
them as self-contained statements.

# INPUTS
- "Assistant (context only)": the preceding assistant message. Use it ONLY to
  resolve references ("ja", "die", "zij") in the user's message. Never extract a
  fact that only the assistant said; extract it only when the user confirms it.
- "User": the latest user message. Extract only what it newly states or confirms.
- "Message time": the ONLY anchor for relative dates ("morgen", "next Tuesday").

# WHAT TO EXTRACT
Good memories: personal facts, preferences and dislikes, people and
relationships (names, roles, birthdays), appointments and important dates,
plans, routines, health facts, and corrections of earlier information. Also
extract what the user did or experienced (an outing, a visit, an activity)
as an L2 event, and the user's own current state (mood, pain, tiredness) as an
L3 transient state.
Do NOT extract: small talk, greetings, thanks, questions to the assistant,
general remarks about emotions that are not the user's own state, requests to
operate apps, or anything the assistant said that the user did not confirm.
Do NOT extract requests to forget, delete, or stop remembering something, and
never store the content of such a request.
NEVER extract passwords, PIN codes, access codes, or other credentials.

# LAYERS
- L0: basic profile of the user (name, birth date, place of residence) as the
  user states it. Never guess a residence, nationality, or language.
- L4: identity: durable preferences, traits, values, and people in the user's
  life and their relationship to the user ("Anna is de dochter van de gebruiker").
- L2: atomic facts and events, including appointments and dates.
- L3: temporary states that will not matter in a few days
  ("de gebruiker is vandaag moe"); set "transient": true for these.
- L7: an ongoing goal or plan the user explicitly states they are working
  towards ("de gebruiker wil voor de zomer vijf kilo afvallen"); a one-off
  appointment or errand is L2.

# FIELDS
- subject: who the memory is about: "user" for the user, otherwise the person's
  name (e.g. "Anna"). Never merge facts about different people.
- text: one self-contained third-person statement in the SAME language as the
  user's message: English for an English message, Dutch for a Dutch one. The
  Dutch examples in this prompt illustrate form only; never translate. Keep names, places, numbers, and time precision exactly.
  Always state how another person relates to the user, e.g. "Brecht, de zoon
  van de gebruiker, woont in Ninove." rather than "Brecht woont in Ninove."
- event_at: ISO 8601 date or date-time of the event or appointment, resolved
  against the message time; null when there is no specific date. Do not invent
  dates for vague phrases.
- sensitivity: "health" for health, medication, diagnosis, and care details;
  otherwise "general".
- provenance: "stated" when the user said it explicitly; "inferred" when it is
  strongly implied (for example, a preference implied by a repeated choice).
- transient: true only for temporary states.

# RULES
- Use as few items as possible, but every distinct durable fact appears once.
- Split only when subjects differ or events are independent.
- When the user corrects something, state only the new, correct information.
- A repeated activity ("weer", "again", "zoals elke week") is a new event each
  time: extract it with its own date, even when it happened before.
- Return {"items": []} when there is nothing worth remembering.
- Field names are English; values keep the user's language.
- Output exactly one JSON object: {"items": [...]}.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normaliseDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return undefined;
  const parsed = new Date(text.length === 10 ? `${text}T00:00:00.000Z` : text);
  return Number.isNaN(parsed.getTime()) ? undefined : text.length === 10 ? text : parsed.toISOString();
}

/** Validates extractor output and drops malformed items. */
export function parseExtractedItems(payload: unknown): ExtractedItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];
  const items: ExtractedItem[] = [];
  for (const entry of payload.items.slice(0, 8)) {
    if (!isRecord(entry)) continue;
    const layer = (EXTRACTED_LAYERS as readonly unknown[]).includes(entry.layer) ? (entry.layer as ExtractedLayer) : undefined;
    const subject = typeof entry.subject === "string" ? entry.subject.trim().slice(0, 120) : "";
    const text = typeof entry.text === "string" ? entry.text.trim().slice(0, 600) : "";
    if (!layer || !subject || !text) continue;
    const eventAt = normaliseDate(entry.event_at);
    items.push({
      layer,
      subject,
      text,
      ...(eventAt ? { eventAt } : {}),
      sensitivity: entry.sensitivity === "health" ? "health" : "general",
      provenance: entry.provenance === "inferred" ? "inferred" : "stated",
      transient: entry.transient === true,
    });
  }
  return items;
}

const STOPWORDS = {
  en: new Set("the and is are was i my me you it to of in that have with for this not but on at".split(" ")),
  nl: new Set("de het en is een ik mijn me je dat van in niet met voor op zijn maar ook er wat naar".split(" ")),
} as const;

/** Cheap stopword vote between English and Dutch; undefined when unclear. */
export function detectLanguage(text: string): "en" | "nl" | undefined {
  const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  let en = 0;
  let nl = 0;
  for (const word of words) {
    if (STOPWORDS.en.has(word)) en += 1;
    if (STOPWORDS.nl.has(word)) nl += 1;
  }
  if (en + nl < 2 || en === nl) return undefined;
  return en > nl ? "en" : "nl";
}

const LANGUAGE_NAMES = { en: "English", nl: "Dutch" } as const;

export function extractionUserPrompt(request: ExtractionRequest): string {
  const language = detectLanguage(request.userTurn);
  return [
    `Message time: ${request.turnTime}`,
    language ? `Write every text in ${LANGUAGE_NAMES[language]}, the language of the user's message.` : undefined,
    request.kindHint && request.kindHint !== "none" ? `Gate hint: likely ${request.kindHint}` : undefined,
    request.isCorrection ? "Gate hint: the user is probably correcting earlier information." : undefined,
    request.previousAssistantTurn ? `Assistant (context only): ${request.previousAssistantTurn}` : undefined,
    `User: ${request.userTurn}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export class LlmExtractor implements Extractor {
  readonly id: string;
  private readonly client: ChatClient;

  constructor(client: ChatClient) {
    this.client = client;
    this.id = `llm-extractor:${client.id}`;
  }

  async extract(request: ExtractionRequest): Promise<ExtractedItem[]> {
    const completion = await this.client.complete({
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: extractionUserPrompt(request) },
      ],
      responseFormat: { type: "json_schema", name: "memory_extraction", schema: EXTRACTION_SCHEMA },
      temperature: 0,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const payload = parseJsonObject(completion.content);
    if (!payload) throw new Error("Extractor returned invalid JSON.");
    return parseExtractedItems(payload);
  }
}
