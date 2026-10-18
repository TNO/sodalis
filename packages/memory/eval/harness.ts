import type { ChatClient } from "../src/ChatClient.js";
import { Consolidator, type ConsolidationReport, type Inducer } from "../src/Consolidator.js";
import type { DecisionGate } from "../src/DecisionGate.js";
import type { Embedder, EmbedderDescriptor } from "../src/Embedder.js";
import type { Extractor } from "../src/Extractor.js";
import { Memory } from "../src/Memory.js";
import { MemoryService } from "../src/MemoryService.js";
import type { Reconciler } from "../src/Reconciler.js";
import {
  formatRecallResult,
  isRecallReply,
  parseRecallCall,
  RECALL_MEMORY_INSTRUCTION,
  recalledContextPrompt,
  type RecallCall,
} from "../src/Recall.js";
import type { WriteTrace } from "../src/WritePipeline.js";
import { containsKeywords, type EvalCase, type EvalQuestion, type EvalTurn } from "./cases.js";

export interface EvalRoles {
  readonly embedder: Embedder;
  readonly gate: DecisionGate;
  readonly extractor: Extractor;
  readonly reconciler: Reconciler;
  readonly answer: ChatClient;
  /** LLM judge for QA; keyword scoring is used without one. */
  readonly judge?: ChatClient;
  readonly inducer?: Inducer;
}

export interface RunOptions {
  readonly gateThreshold?: number;
  /**
   * Run System 2 consolidation after ingest (task 0050). `compare` answers
   * every question before and after consolidation from the same ingest.
   */
  readonly system2?: boolean | "compare";
  /** System 2 cluster size (default 2, as in production). */
  readonly minClusterSize?: number;
  /** Offer the `recall_memory` tool to the answer model (default true, task 0049). */
  readonly recall?: boolean;
  /** Replay the sessions into memory (default true); false gives a no-memory baseline. */
  readonly ingest?: boolean;
  readonly tokenBudget?: number;
  readonly signal?: AbortSignal;
}

export interface LabelledTrace {
  readonly sessionId: string;
  readonly turn: EvalTurn;
  readonly trace?: WriteTrace;
}

export interface QuestionResult {
  readonly question: EvalQuestion;
  readonly answer: string;
  readonly correct: boolean;
  /** The memory block the answer model saw, for diagnosing failures. */
  readonly memory: string;
  readonly memoryTokens: number;
  readonly retrieveMs: number;
  /** The recall the answer model requested, with the number of excerpts found. */
  readonly recall?: RecallCall & { readonly excerpts: number };
  /** Set when re-grading (`rejudge`) changed the original grade. */
  readonly regraded?: boolean;
}

export interface CaseResult {
  readonly caseId: string;
  readonly turns: readonly LabelledTrace[];
  readonly questions: readonly QuestionResult[];
  /** Answers after System 2 consolidation, when comparing. */
  readonly questionsSystem2?: readonly QuestionResult[];
  readonly consolidation?: ConsolidationReport;
  readonly items: number;
  readonly ingestMs: number;
  readonly embedMs: number;
}

/** Wraps an embedder to measure time spent embedding. */
export class TimedEmbedder implements Embedder {
  readonly descriptor: EmbedderDescriptor;
  totalMs = 0;
  calls = 0;
  private readonly inner: Embedder;

  constructor(inner: Embedder) {
    this.inner = inner;
    this.descriptor = inner.descriptor;
  }

  async embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]> {
    const started = performance.now();
    this.calls += 1;
    try {
      return await this.inner.embed(texts, signal);
    } finally {
      this.totalMs += performance.now() - started;
    }
  }
}

const ANSWER_PROMPT = {
  nl: "Je bent een persoonlijke assistent. Beantwoord de vraag kort, alleen op basis van het geheugen hieronder.",
  en: "You are a personal assistant. Answer the question briefly, using only the memory below.",
};

/** Placed after the memory block; with recall, giving up comes after searching. */
const NOT_KNOWN_PROMPT = {
  nl: { plain: "Staat het antwoord er niet in, zeg dan dat je het niet weet.", recall: "Staat het antwoord niet in het geheugen en ook niet in een recall_memory-zoekopdracht, zeg dan dat je het niet weet." },
  en: { plain: "If the answer is not in it, say that you do not know.", recall: "If neither the memory nor a recall_memory search contains the answer, say that you do not know." },
};

const CHOICE_PROMPT = {
  nl: "Kies het antwoord dat het best bij deze gebruiker past. Antwoord alleen met de letter.",
  en: "Choose the response that best fits this user. Reply with the letter only.",
};

const LETTERS = "ABCDEFGH";

function choiceText(question: EvalQuestion, language: EvalCase["language"]): string {
  const options = question.choices!.map((choice, index) => `${LETTERS[index]}. ${choice}`).join("\n");
  return `${question.question}\n\n${options}\n\n${CHOICE_PROMPT[language]}`;
}

/** The first standalone option letter in an answer. */
export function chosenLetter(answer: string, count: number): string | undefined {
  const match = new RegExp(`(?:^|[^\\p{L}])([${LETTERS.slice(0, count)}])(?![\\p{L}])`, "u").exec(answer.trim());
  return match?.[1];
}

const JUDGE_PROMPT = `You grade answers of a personal assistant. Given a question, a reference
answer, and the assistant's answer, decide whether the assistant's answer is
correct: it must contain the essential information of the reference (other
wording, language, or extra detail is fine). If the reference says the answer
is unknown, the assistant is correct only if it says it does not know.
Reply with exactly one JSON object: {"correct": boolean}`;

const ABSTAIN = /\b(weet (ik )?(het )?niet|niet (bekend|verteld|gezegd)|geen (informatie|idee|gegevens)|don't know|do not know|not sure|no information|not mentioned)\b/i;

const HEDGED = /\b(but|however|though|maar|echter)\b/i;

async function grade(question: EvalQuestion, answer: string, judge: ChatClient | undefined, signal?: AbortSignal) {
  if (question.choices) return chosenLetter(answer, question.choices.length) === question.answer;
  // Non-answers are graded without the judge: small judges accept "I don't know" too often.
  // A hedge followed by an answer ("not sure, but it is Ghent") still goes to the judge.
  if (ABSTAIN.test(answer) && !HEDGED.test(answer)) return question.abstain === true;
  if (judge) {
    const completion = await judge.complete({
      messages: [
        { role: "system", content: JUDGE_PROMPT },
        {
          role: "user",
          // A JSON payload: gemma4 judged plain "Question/Reference/Assistant" text as incorrect far too often.
          content: JSON.stringify({ question: question.question, reference: question.answer, answer }),
        },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0,
      ...(signal ? { signal } : {}),
    });
    return /"correct"\s*:\s*true/.test(completion.content);
  }
  if (question.abstain) return false;
  const keywords = question.keywords?.length ? question.keywords : [question.answer];
  return containsKeywords(answer, keywords);
}

/**
 * Ingests a case through the memory service's public interface (user and
 * assistant turns, then `drain`), optionally consolidates, and answers each
 * question with the retrieved memory block only.
 */
/**
 * Re-grades every free-form answer with the current grading rules and judge
 * (multiple-choice grades are deterministic and kept), so results graded at
 * different times use one rule. Returns the number of changed grades.
 */
export async function rejudge(
  results: readonly CaseResult[],
  judge: ChatClient,
  signal?: AbortSignal,
): Promise<{ results: CaseResult[]; changed: number }> {
  let changed = 0;
  const regrade = async (questions: readonly QuestionResult[]) => {
    const output: QuestionResult[] = [];
    for (const entry of questions) {
      const correct = entry.question.choices ? entry.correct : await grade(entry.question, entry.answer, judge, signal);
      if (correct !== entry.correct) changed += 1;
      output.push(correct === entry.correct ? entry : { ...entry, correct, regraded: true });
    }
    return output;
  };
  const output: CaseResult[] = [];
  for (const result of results) {
    output.push({
      ...result,
      questions: await regrade(result.questions),
      ...(result.questionsSystem2 ? { questionsSystem2: await regrade(result.questionsSystem2) } : {}),
    });
  }
  return { results: output, changed };
}

export async function runCase(evalCase: EvalCase, roles: EvalRoles, options: RunOptions = {}): Promise<CaseResult> {
  let now = new Date(evalCase.sessions[0]?.date ?? Date.now());
  const embedder = new TimedEmbedder(roles.embedder);
  const memory = await Memory.open({ path: ":memory:", embedder, clock: () => now });
  const traces = new Map<number, WriteTrace>();
  const service = new MemoryService({
    memory,
    gate: roles.gate,
    extractor: roles.extractor,
    reconciler: roles.reconciler,
    requireConsent: false,
    queue: { retryDelayMs: 1, maxAttempts: 2 },
    retrieval: options.tokenBudget ? { tokenBudget: options.tokenBudget } : {},
    onTrace: (trace) => traces.set(trace.turnId, trace),
    ...(options.gateThreshold === undefined ? {} : { gateThreshold: options.gateThreshold }),
  });
  memory.store.recordConsent("health", true, "evaluation");
  const ingested: { sessionId: string; turn: EvalTurn; storeId?: number }[] = [];
  const started = performance.now();
  try {
    for (const session of options.ingest === false ? [] : evalCase.sessions) {
      for (const [index, turn] of session.turns.entries()) {
        now = new Date(Date.parse(session.date) + index * 60_000);
        const input = { sessionId: session.id, turnId: `${session.id}:${index}`, text: turn.text, createdAt: now.toISOString() };
        const stored = turn.role === "user" ? service.recordUserTurn(input) : service.recordAssistantTurn(input);
        ingested.push({ sessionId: session.id, turn, ...(stored ? { storeId: stored.id } : {}) });
        if (turn.role === "user") await service.drain();
      }
    }
    let consolidation: ConsolidationReport | undefined;
    const consolidate = async () => {
      consolidation = await new Consolidator({
        memory,
        inducer: roles.inducer!,
        minNewItems: 1,
        ...(options.minClusterSize ? { minClusterSize: options.minClusterSize } : {}),
      }).run(options.signal);
    };
    if (options.system2 === true && roles.inducer) await consolidate();
    const ingestMs = performance.now() - started;

    const answerAll = async (): Promise<QuestionResult[]> => {
      const results: QuestionResult[] = [];
      for (const question of evalCase.questions) {
        options.signal?.throwIfAborted();
        now = new Date(question.askedAt);
        const retrieveStarted = performance.now();
        // A no-memory baseline has nothing to retrieve, so it never calls the embedder.
        const retrieved =
          options.ingest === false ? { block: "", estimatedTokens: 0 } : await service.retrieve(question.question, undefined, options.signal);
        const retrieveMs = performance.now() - retrieveStarted;
        const system = `${ANSWER_PROMPT[evalCase.language]}\n\n${retrieved.block}`;
        const notKnown = NOT_KNOWN_PROMPT[evalCase.language];
        const user = question.choices ? choiceText(question, evalCase.language) : question.question;
        const ask = async (extra: string) =>
          (
            await roles.answer.complete({
              messages: [
                { role: "system", content: `${system}\n\n${extra ? `${extra}\n\n` : ""}${extra === RECALL_MEMORY_INSTRUCTION ? notKnown.recall : notKnown.plain}` },
                { role: "user", content: user },
              ],
              temperature: 0,
              maxTokens: 200,
              ...(options.signal ? { signal: options.signal } : {}),
            })
          ).content.trim();
        const offerRecall = options.recall !== false && options.ingest !== false;
        let answer = await ask(offerRecall ? RECALL_MEMORY_INSTRUCTION : "");
        let recall: QuestionResult["recall"];
        if (offerRecall && isRecallReply(answer)) {
          const call = parseRecallCall(answer);
          const found = call?.query.trim() ? await service.recall({ ...call, ...(options.signal ? { signal: options.signal } : {}) }) : { excerpts: [] };
          recall = { ...(call ?? { query: "" }), excerpts: found.excerpts.length };
          answer = await ask(recalledContextPrompt(call?.query ?? "", formatRecallResult(found)));
        }
        results.push({
          question,
          answer,
          correct: await grade(question, answer, roles.judge, options.signal),
          memory: retrieved.block,
          memoryTokens: retrieved.estimatedTokens,
          retrieveMs,
          ...(recall ? { recall } : {}),
        });
      }
      return results;
    };
    const questions = await answerAll();
    let questionsSystem2: QuestionResult[] | undefined;
    if (options.system2 === "compare" && roles.inducer) {
      await consolidate();
      questionsSystem2 = await answerAll();
    }
    return {
      caseId: evalCase.id,
      turns: ingested.map(({ sessionId, turn, storeId }) => {
        const trace = storeId === undefined ? undefined : traces.get(storeId);
        return { sessionId, turn, ...(trace ? { trace } : {}) };
      }),
      questions,
      ...(questionsSystem2 ? { questionsSystem2 } : {}),
      ...(consolidation ? { consolidation } : {}),
      items: memory.store.listItems({ statuses: ["active"], limit: 100_000 }).length,
      ingestMs,
      embedMs: embedder.totalMs,
    };
  } finally {
    await service.stop();
    memory.close();
  }
}
