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
  /** Stratified sampling: at most this many questions per question type. */
  readonly perType?: number;
  readonly types?: readonly string[];
  readonly seed?: number;
  /** Keep the evidence sessions plus this many random others (cheaper runs). */
  readonly distractorSessions?: number;
}

/** One case per question; sessions are replayed in chronological order. */
export function parseLongMemEval(records: readonly LongMemEvalRecord[], options: LongMemEvalOptions = {}): EvalCase[] {
  const random = new Random(options.seed ?? 7);
  let selected = random.shuffle(
    records.filter((record) => !options.types?.length || options.types.includes(record.question_type)),
  );
  if (options.perType !== undefined) {
    const taken = new Map<string, number>();
    selected = selected.filter((record) => {
      const count = taken.get(record.question_type) ?? 0;
      taken.set(record.question_type, count + 1);
      return count < options.perType!;
    });
  }
  selected = selected.slice(0, options.limit ?? selected.length);
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

/** CC BY 4.0 (Jiang et al., PersonaMem-v2). */
export const PERSONAMEM_BENCHMARK_URL =
  "https://huggingface.co/datasets/bowen-upenn/PersonaMem-v2/resolve/main/benchmark/text/benchmark.csv";
export const PERSONAMEM_FILE_URL = "https://huggingface.co/datasets/bowen-upenn/PersonaMem-v2/resolve/main/";

/** RFC 4180 CSV with a header row; fields may hold quotes, commas, and newlines. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return (body ?? [])
    .filter((cells) => cells.some(Boolean))
    .map((cells) => Object.fromEntries(header!.map((name, column) => [name, cells[column] ?? ""])));
}

/** The `content` of a JSON or Python-repr message dict. */
function messageContent(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && typeof (parsed as { content?: unknown }).content === "string") {
      return (parsed as { content: string }).content;
    }
  } catch {
    // Python repr: {'role': 'user', 'content': '...'}
  }
  const match = /['"]content['"]:\s*(['"])/.exec(value);
  if (!match) return value;
  const quote = match[1]!;
  let content = "";
  for (let index = match.index + match[0].length; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "\\") {
      const next = value[index + 1] ?? "";
      content += next === "n" ? "\n" : next === "t" ? "\t" : next;
      index += 1;
    } else if (char === quote) break;
    else content += char;
  }
  return content;
}

export type PersonaMemRow = Readonly<Record<string, string>>;

/** The rows of the `count` personas with the most questions. */
export function selectPersonaMemRows(rows: readonly PersonaMemRow[], count: number): PersonaMemRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.persona_id!, (counts.get(row.persona_id!) ?? 0) + 1);
  const chosen = new Set(
    [...counts].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0])).slice(0, count).map(([id]) => id),
  );
  return rows.filter((row) => chosen.has(row.persona_id!));
}

export interface PersonaMemHistory {
  readonly chat_history: readonly { role: string; content: string }[];
}

/**
 * One case per chat history. The system message holds the persona and is
 * dropped. Histories carry no dates, so every 10 turns become a session one
 * day after the previous; questions are four-way multiple choice in a seeded
 * order, typed by `pref_type`.
 */
export function parsePersonaMem(
  rows: readonly PersonaMemRow[],
  history: (link: string) => PersonaMemHistory | undefined,
  options: { seed?: number; start?: string; turnsPerSession?: number } = {},
): EvalCase[] {
  const random = new Random(options.seed ?? 7);
  const perSession = options.turnsPerSession ?? 10;
  const start = Date.parse(options.start ?? "2026-01-05T10:00:00.000Z");
  const links = [...new Set(rows.map((row) => row.chat_history_32k_link!))];
  return links.flatMap((link) => {
    const chat = history(link)?.chat_history.filter((message) => message.role === "user" || message.role === "assistant");
    if (!chat) return [];
    const sessions: EvalSession[] = [];
    for (let index = 0; index < chat.length; index += perSession) {
      sessions.push({
        id: `s${sessions.length + 1}`,
        date: new Date(start + sessions.length * 86_400_000).toISOString(),
        turns: chat.slice(index, index + perSession).map((message): EvalTurn => ({
          role: message.role as EvalTurn["role"],
          text: message.content,
        })),
      });
    }
    const askedAt = new Date(start + sessions.length * 86_400_000).toISOString();
    const linkRows = rows.filter((row) => row.chat_history_32k_link === link);
    return [
      {
        id: `personamem:${linkRows[0]!.persona_id}`,
        source: "PersonaMem-v2 (CC BY 4.0, Jiang et al.)",
        language: "en" as const,
        sessions,
        questions: linkRows.map((row, index) => {
          const choices = random.shuffle([row.correct_answer!, ...parseMaybeJson<string[]>(row.incorrect_answers)]);
          return {
            id: `${row.persona_id}:${index}`,
            type: row.pref_type || "personamem",
            question: messageContent(row.user_query!),
            answer: "ABCDEFGH"[choices.indexOf(row.correct_answer!)]!,
            choices,
            askedAt,
          };
        }),
      },
    ];
  });
}

const TRANSLATE_PROMPT = `Translate each text from English to natural Dutch (Flemish register is fine).
Keep names, numbers, and dates exact; translate measurement words but keep
values. Reply with exactly one JSON object {"texts": [string]} with the same
number of items in the same order.`;

/** Machine-translates a case to Dutch in batches; spot-check the output by hand. */
export interface TranslateOptions {
  readonly signal?: AbortSignal;
  /** Truncate assistant turns to this many characters (they are write-path context only). */
  readonly assistantChars?: number;
}

const BATCH_CHARS = 4_000;
const MAX_TEXT_CHARS = 500;

/** Machine-translates a case to Dutch in batches; spot-check the output by hand. */
export async function translateCase(evalCase: EvalCase, client: ChatClient, options: TranslateOptions = {}): Promise<EvalCase> {
  const { signal } = options;
  const request = async (batch: readonly string[]): Promise<string[] | undefined> => {
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
    return Array.isArray(translated) && translated.length === batch.length ? translated.map(String) : undefined;
  };
  const translateBatches = async (texts: readonly string[]): Promise<string[]> => {
    const output: string[] = [];
    let start = 0;
    while (start < texts.length) {
      let end = start + 1;
      let chars = texts[start]!.length;
      while (end < texts.length && end - start < 12 && chars + texts[end]!.length <= BATCH_CHARS) chars += texts[end++]!.length;
      const batch = texts.slice(start, end);
      let translated = await request(batch);
      if (!translated && batch.length > 1) {
        translated = [];
        for (const text of batch) translated.push(...((await request([text])) ?? []));
      }
      if (!translated || translated.length !== batch.length) {
        throw new Error(`Translation batch at ${start} returned ${translated?.length ?? "no"} texts.`);
      }
      output.push(...translated);
      start = end;
    }
    return output;
  };
  const translate = async (texts: readonly string[]): Promise<string[]> => {
    const chunks = texts.map((text) => {
      const parts: string[] = [];
      let start = 0;
      while (start < text.length) {
        let end = Math.min(start + MAX_TEXT_CHARS, text.length);
        if (end < text.length) {
          const boundary = text.lastIndexOf(" ", end);
          if (boundary > start) end = boundary;
        }
        parts.push(text.slice(start, end));
        start = end;
      }
      return parts;
    });
    const translated = await translateBatches(chunks.flat());
    let offset = 0;
    return chunks.map((parts) => {
      const result = translated.slice(offset, offset + parts.length).join("");
      offset += parts.length;
      return result;
    });
  };
  const clip = (turn: EvalTurn) =>
    turn.role === "assistant" && options.assistantChars !== undefined && turn.text.length > options.assistantChars
      ? `${turn.text.slice(0, options.assistantChars - 1)}…`
      : turn.text;
  const sessions: EvalSession[] = [];
  for (const session of evalCase.sessions) {
    const texts = await translate(session.turns.map(clip));
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
