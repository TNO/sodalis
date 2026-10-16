import { parseJsonObject, type ChatClient } from "../src/ChatClient.js";
import type { EvalCase, EvalSession, EvalTurn } from "./cases.js";
import { Random } from "./random.js";

export const LONGMEMEVAL_S_URL =
  "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json";
/** CC BY-NC 4.0: download for local evaluation only; never commit or redistribute. */
export const LOCOMO_URL = "https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json";

function parseMaybeJson<T>(value: unknown): T {
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    // The cleaned files are JSON; tolerate Python-literal dumps in older copies.
    return JSON.parse(value.replace(/'/g, '"')) as T;
  }
}

/** "2023/04/10 (Mon) 23:07" → ISO. */
export function parseLongMemEvalDate(value: string): string {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})(?:\s*\(\w+\))?\s*(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) throw new RangeError(`Unrecognised LongMemEval date: ${value}`);
  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(+year!, +month! - 1, +day!, +hour!, +minute!)).toISOString();
}

interface LongMemEvalRecord {
  question_id: string;
  question_type: string;
  question: string;
  answer: unknown;
  question_date: string;
  haystack_dates: unknown;
  haystack_session_ids: unknown;
  haystack_sessions: unknown;
  answer_session_ids?: unknown;
}

export interface LongMemEvalOptions {
  readonly limit?: number;
  readonly types?: readonly string[];
  readonly seed?: number;
  /** Keep the evidence sessions plus this many random others (cheaper runs). */
  readonly distractorSessions?: number;
}

/** One case per question; sessions are replayed in chronological order. */
export function parseLongMemEval(records: readonly LongMemEvalRecord[], options: LongMemEvalOptions = {}): EvalCase[] {
  const random = new Random(options.seed ?? 7);
  const selected = random
    .shuffle(records.filter((record) => !options.types?.length || options.types.includes(record.question_type)))
    .slice(0, options.limit ?? records.length);
  return selected.map((record) => {
    const dates = parseMaybeJson<string[]>(record.haystack_dates);
    const ids = parseMaybeJson<string[]>(record.haystack_session_ids);
    const sessions = parseMaybeJson<{ role: string; content: string }[][]>(record.haystack_sessions);
    const evidence = new Set(parseMaybeJson<string[]>(record.answer_session_ids ?? "[]"));
    let indices = sessions.map((_, index) => index);
    if (options.distractorSessions !== undefined) {
      const others = indices.filter((index) => !evidence.has(ids[index]!));
      const kept = new Set([
        ...indices.filter((index) => evidence.has(ids[index]!)),
        ...random.sample(others, options.distractorSessions),
      ]);
      indices = indices.filter((index) => kept.has(index));
    }
    const evalSessions: EvalSession[] = indices
      .map((index) => ({
        id: ids[index] ?? `session-${index}`,
        date: parseLongMemEvalDate(dates[index]!),
        turns: sessions[index]!
          .filter((turn) => turn.role === "user" || turn.role === "assistant")
          .map((turn): EvalTurn => ({ role: turn.role as "user" | "assistant", text: turn.content })),
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
    const abstain = record.question_id.endsWith("_abs");
    return {
      id: `longmemeval:${record.question_id}`,
      source: "LongMemEval-S (cleaned, MIT)",
      language: "en",
      sessions: evalSessions,
      questions: [
        {
          id: record.question_id,
          type: abstain ? "abstention" : record.question_type,
          question: record.question,
          answer: String(record.answer),
          askedAt: parseLongMemEvalDate(record.question_date),
          ...(abstain ? { abstain } : {}),
        },
      ],
    };
  });
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "1:56 pm on 8 May, 2023" → ISO. */
export function parseLoCoMoDate(value: string): string {
  const match = /(\d{1,2}):(\d{2})\s*(am|pm)\s+on\s+(\d{1,2})\s+(\w+),?\s+(\d{4})/i.exec(value);
  if (!match) throw new RangeError(`Unrecognised LoCoMo date: ${value}`);
  const [, hourText, minute, meridiem, day, monthName, year] = match;
  const month = MONTH_NAMES.indexOf(monthName!.toLowerCase());
  const hour = (+hourText! % 12) + (meridiem!.toLowerCase() === "pm" ? 12 : 0);
  return new Date(Date.UTC(+year!, month, +day!, hour, +minute!)).toISOString();
}

export const LOCOMO_CATEGORIES: Readonly<Record<number, string>> = {
  1: "multi-hop",
  2: "temporal",
  3: "open-domain",
  4: "single-hop",
  5: "adversarial",
};

interface LoCoMoRecord {
  sample_id: string;
  conversation: Record<string, unknown>;
  qa: { question: string; answer?: unknown; category: number }[];
}

/**
 * One case per conversation. Both speakers' messages are user turns prefixed
 * with the speaker name, because LoCoMo asks about both speakers while the
 * write path only extracts from user turns. Adversarial questions are skipped.
 */
export function parseLoCoMo(records: readonly LoCoMoRecord[], options: { limit?: number } = {}): EvalCase[] {
  return records.slice(0, options.limit ?? records.length).map((record) => {
    const conversation = record.conversation;
    const sessions: EvalSession[] = [];
    for (let index = 1; Array.isArray(conversation[`session_${index}`]); index += 1) {
      const turns = conversation[`session_${index}`] as { speaker: string; text: string }[];
      sessions.push({
        id: `session_${index}`,
        date: parseLoCoMoDate(String(conversation[`session_${index}_date_time`])),
        turns: turns.map((turn) => ({ role: "user", text: `${turn.speaker}: ${turn.text}` })),
      });
    }
    const askedAt = new Date(Date.parse(sessions.at(-1)!.date) + 86_400_000).toISOString();
    return {
      id: `locomo:${record.sample_id}`,
      source: "LoCoMo (CC BY-NC 4.0, local use only)",
      language: "en",
      sessions,
      questions: record.qa
        .filter((qa) => qa.category !== 5 && qa.answer !== undefined)
        .map((qa, index) => ({
          id: `${record.sample_id}:${index}`,
          type: LOCOMO_CATEGORIES[qa.category] ?? String(qa.category),
          question: qa.question,
          answer: String(qa.answer),
          askedAt,
        })),
    };
  });
}

const TRANSLATE_PROMPT = `Translate each text from English to natural Dutch (Flemish register is fine).
Keep names, numbers, and dates exact; translate measurement words but keep
values. Reply with exactly one JSON object {"texts": [string]} with the same
number of items in the same order.`;

/** Machine-translates a case to Dutch in batches; spot-check the output by hand. */
export async function translateCase(evalCase: EvalCase, client: ChatClient, signal?: AbortSignal): Promise<EvalCase> {
  const translate = async (texts: readonly string[]): Promise<string[]> => {
    const output: string[] = [];
    for (let start = 0; start < texts.length; start += 12) {
      const batch = texts.slice(start, start + 12);
      const completion = await client.complete({
        messages: [
          { role: "system", content: TRANSLATE_PROMPT },
          { role: "user", content: JSON.stringify({ texts: batch }) },
        ],
        responseFormat: { type: "json_object" },
        temperature: 0,
        ...(signal ? { signal } : {}),
      });
      const translated = parseJsonObject(completion.content)?.texts;
      if (!Array.isArray(translated) || translated.length !== batch.length) {
        throw new Error(`Translation batch at ${start} returned ${Array.isArray(translated) ? translated.length : "no"} texts.`);
      }
      output.push(...translated.map(String));
    }
    return output;
  };
  const sessions: EvalSession[] = [];
  for (const session of evalCase.sessions) {
    const texts = await translate(session.turns.map((turn) => turn.text));
    sessions.push({ ...session, turns: session.turns.map((turn, index) => ({ ...turn, text: texts[index]! })) });
  }
  const questionTexts = await translate(evalCase.questions.flatMap((question) => [question.question, question.answer]));
  return {
    ...evalCase,
    id: `${evalCase.id}:nl`,
    source: `${evalCase.source}, machine-translated to Dutch by ${client.id}`,
    language: "nl",
    sessions,
    questions: evalCase.questions.map((question, index) => ({
      ...question,
      question: questionTexts[index * 2]!,
      answer: questionTexts[index * 2 + 1]!,
    })),
  };
}
