import { parseJsonObject, type ChatClient } from "../src/ChatClient.js";
import type { EvalCase, EvalSession, EvalTurn } from "./cases.js";
import { PERSONA_ATTRIBUTION } from "./personas.js";
import { Random } from "./random.js";
import { dutchDate, type Scenario } from "./scenario.js";

export interface Renderer {
  readonly id: string;
  renderSession(scenario: Scenario, sessionIndex: number, signal?: AbortSignal): Promise<EvalTurn[]>;
}

const ACKNOWLEDGEMENTS = [
  "Dank u, dat onthoud ik.",
  "Wat fijn dat u dat vertelt.",
  "Goed om te weten.",
  "Ah, dat is interessant.",
  "Ik begrijp het.",
];

/** Deterministic renderer: each event is one user turn with its canonical text. */
export class TemplateRenderer implements Renderer {
  readonly id = "template";

  async renderSession(scenario: Scenario, sessionIndex: number): Promise<EvalTurn[]> {
    const random = new Random(scenario.seed + sessionIndex);
    const session = scenario.sessions[sessionIndex]!;
    const turns: EvalTurn[] = [];
    for (const eventId of session.events) {
      turns.push({ role: "user", text: scenario.events[eventId]!.say, events: [eventId] });
      turns.push({ role: "assistant", text: random.pick(ACKNOWLEDGEMENTS) });
    }
    return turns;
  }
}

export const RENDER_SYSTEM_PROMPT = `Je schrijft realistische gesprekken in het Vlaams-Nederlands tussen een
oudere persoon (de gebruiker) en een vriendelijke spraakassistent die de
gebruiker met "u" aanspreekt. Je krijgt een korte beschrijving van de persoon
en een lijst uitspraken met een id. Regels:
- Elke uitspraak komt in precies één eigen gebruikersbeurt, in de eigen woorden
  van de gebruiker en spreektaal, maar met exact dezelfde feiten: namen, data,
  uren en plaatsen blijven ongewijzigd. Voeg geen nieuwe persoonlijke feiten toe.
- Behoud de volgorde. De assistent reageert kort en natuurlijk; de assistent
  verzint geen feiten over de gebruiker.
- Je mag 1 of 2 korte beurten zonder persoonlijke feiten toevoegen (begroeting,
  afscheid); die hebben "events": [].
- Antwoord met precies één JSON-object:
  {"turns": [{"role": "user"|"assistant", "text": string, "events": [string]}]}`;

export const JUDGE_SYSTEM_PROMPT = `Je controleert of uitspraken correct in een gesprek terechtkwamen. Voor
elke id krijg je het bedoelde feit en de gebruikersbeurt die het moet bevatten.
Een feit is aanwezig als alle namen, data, uren en plaatsen kloppen en de
betekenis gelijk is. Antwoord met precies één JSON-object:
{"results": [{"id": string, "present": boolean}]}`;

interface RenderedTurn {
  role: "user" | "assistant";
  text: string;
  events: string[];
}

function parseTurns(content: string, expected: readonly string[]): RenderedTurn[] | undefined {
  const payload = parseJsonObject(content);
  if (!payload || !Array.isArray(payload.turns)) return undefined;
  const turns: RenderedTurn[] = [];
  for (const entry of payload.turns) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const value = entry as Record<string, unknown>;
    if ((value.role !== "user" && value.role !== "assistant") || typeof value.text !== "string") return undefined;
    const events = Array.isArray(value.events) ? value.events.map(String) : [];
    turns.push({ role: value.role, text: value.text.trim(), events: value.role === "user" ? events : [] });
  }
  const seen = turns.flatMap((turn) => turn.events);
  if (seen.length !== expected.length || expected.some((id) => !seen.includes(id))) return undefined;
  return turns;
}

/**
 * Renders a session with an LLM and has a judge verify every planted event;
 * failing sessions are regenerated, then fall back to the template renderer.
 */
export class LlmRenderer implements Renderer {
  readonly id: string;
  readonly failures: { scenario: string; session: number }[] = [];
  private readonly writer: ChatClient;
  private readonly judge: ChatClient;
  private readonly attempts: number;

  constructor(writer: ChatClient, judge: ChatClient, attempts = 3) {
    this.writer = writer;
    this.judge = judge;
    this.attempts = attempts;
    this.id = `llm:${writer.id}`;
  }

  async renderSession(scenario: Scenario, sessionIndex: number, signal?: AbortSignal): Promise<EvalTurn[]> {
    const session = scenario.sessions[sessionIndex]!;
    const { persona } = scenario;
    const prompt = [
      `Persoon: ${persona.firstName}, ${persona.age} jaar, ${persona.sex === "Vrouw" ? "vrouw" : "man"}, woont in ${persona.municipality}.`,
      `Achtergrond: ${persona.summary.slice(0, 400)}`,
      `Datum van het gesprek: ${dutchDate(session.date, true)}.`,
      "Uitspraken:",
      ...session.events.map((id) => `[${id}] ${scenario.events[id]!.say}`),
    ].join("\n");
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      signal?.throwIfAborted();
      const completion = await this.writer.complete({
        messages: [
          { role: "system", content: RENDER_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        responseFormat: { type: "json_object" },
        temperature: 0.7,
        ...(signal ? { signal } : {}),
      });
      const turns = parseTurns(completion.content, session.events);
      if (!turns) continue;
      if (await this.verified(scenario, turns, signal)) {
        return turns.map((turn) => (turn.role === "user" ? turn : { role: turn.role, text: turn.text }));
      }
    }
    this.failures.push({ scenario: scenario.id, session: sessionIndex });
    return new TemplateRenderer().renderSession(scenario, sessionIndex);
  }

  private async verified(scenario: Scenario, turns: readonly RenderedTurn[], signal?: AbortSignal): Promise<boolean> {
    const checks = turns.flatMap((turn) =>
      turn.events.map((id) => `[${id}] bedoeld feit: ${scenario.events[id]!.say}\n[${id}] gebruikersbeurt: ${turn.text}`),
    );
    if (!checks.length) return true;
    const completion = await this.judge.complete({
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: checks.join("\n\n") },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0,
      ...(signal ? { signal } : {}),
    });
    const payload = parseJsonObject(completion.content);
    const results = Array.isArray(payload?.results) ? (payload.results as { id?: unknown; present?: unknown }[]) : [];
    const expected = turns.flatMap((turn) => turn.events);
    return expected.every((id) => results.some((result) => String(result.id) === id && result.present === true));
  }
}

/** Renders every session of a scenario into an evaluation case. */
export async function renderScenario(scenario: Scenario, renderer: Renderer, signal?: AbortSignal): Promise<EvalCase> {
  const sessions: EvalSession[] = [];
  for (const [index, session] of scenario.sessions.entries()) {
    sessions.push({ id: session.id, date: session.date, turns: await renderer.renderSession(scenario, index, signal) });
  }
  return {
    id: `synthetic:${scenario.id}`,
    source: `synthetic-nl (${renderer.id}); ${PERSONA_ATTRIBUTION}`,
    language: "nl",
    sessions,
    questions: scenario.questions,
    events: scenario.events,
  };
}
