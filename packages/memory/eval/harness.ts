import type { ChatClient } from "../src/ChatClient.js";
import { Consolidator, type Inducer } from "../src/Consolidator.js";
import type { DecisionGate } from "../src/DecisionGate.js";
import type { Embedder, EmbedderDescriptor } from "../src/Embedder.js";
import type { Extractor } from "../src/Extractor.js";
import { Memory } from "../src/Memory.js";
import { MemoryService } from "../src/MemoryService.js";
import type { Reconciler } from "../src/Reconciler.js";
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
  /** Run System 2 consolidation after ingest (task 0050). */
  readonly system2?: boolean;
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
}

export interface CaseResult {
  readonly caseId: string;
  readonly turns: readonly LabelledTrace[];
  readonly questions: readonly QuestionResult[];
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
  nl: "Je bent een persoonlijke assistent. Beantwoord de vraag kort, alleen op basis van het geheugen hieronder. Staat het antwoord er niet in, zeg dan dat je het niet weet.",
  en: "You are a personal assistant. Answer the question briefly, using only the memory below. If the answer is not in it, say that you do not know.",
};

const JUDGE_PROMPT = `You grade answers of a personal assistant. Given a question, a reference
answer, and the assistant's answer, decide whether the assistant's answer is
correct: it must contain the essential information of the reference (other
wording, language, or extra detail is fine). If the reference says the answer
is unknown, the assistant is correct only if it says it does not know.
Reply with exactly one JSON object: {"correct": boolean}`;

const ABSTAIN = /\b(weet (ik )?(het )?niet|niet (bekend|verteld|gezegd)|geen (informatie|idee|gegevens)|don't know|do not know|not sure|no information|not mentioned)\b/i;

async function grade(question: EvalQuestion, answer: string, judge: ChatClient | undefined, signal?: AbortSignal) {
  if (judge) {
    const completion = await judge.complete({
      messages: [
        { role: "system", content: JUDGE_PROMPT },
        {
          role: "user",
          content: `Question: ${question.question}\nReference: ${question.answer}\nAssistant: ${answer}`,
        },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0,
      ...(signal ? { signal } : {}),
    });
    return /"correct"\s*:\s*true/.test(completion.content);
  }
  if (question.abstain) return ABSTAIN.test(answer);
  const keywords = question.keywords?.length ? question.keywords : [question.answer];
  return containsKeywords(answer, keywords);
}

/**
 * Ingests a case through the memory service's public interface (user and
 * assistant turns, then `drain`), optionally consolidates, and answers each
 * question with the retrieved memory block only.
 */
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
    for (const session of evalCase.sessions) {
      for (const [index, turn] of session.turns.entries()) {
        now = new Date(Date.parse(session.date) + index * 60_000);
        const input = { sessionId: session.id, turnId: `${session.id}:${index}`, text: turn.text, createdAt: now.toISOString() };
        const stored = turn.role === "user" ? service.recordUserTurn(input) : service.recordAssistantTurn(input);
        ingested.push({ sessionId: session.id, turn, ...(stored ? { storeId: stored.id } : {}) });
        if (turn.role === "user") await service.drain();
      }
    }
    if (options.system2 && roles.inducer) {
      await new Consolidator({ memory, inducer: roles.inducer, minNewItems: 1 }).run(options.signal);
    }
    const ingestMs = performance.now() - started;
    const questions: QuestionResult[] = [];
    for (const question of evalCase.questions) {
      options.signal?.throwIfAborted();
      now = new Date(question.askedAt);
      const retrieveStarted = performance.now();
      const retrieved = await service.retrieve(question.question, undefined, options.signal);
      const retrieveMs = performance.now() - retrieveStarted;
      const completion = await roles.answer.complete({
        messages: [
          { role: "system", content: `${ANSWER_PROMPT[evalCase.language]}\n\n${retrieved.block}` },
          { role: "user", content: question.question },
        ],
        temperature: 0,
        maxTokens: 200,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const answer = completion.content.trim();
      questions.push({
        question,
        answer,
        correct: await grade(question, answer, roles.judge, options.signal),
        memory: retrieved.block,
        memoryTokens: retrieved.estimatedTokens,
        retrieveMs,
      });
    }
    return {
      caseId: evalCase.id,
      turns: ingested.map(({ sessionId, turn, storeId }) => {
        const trace = storeId === undefined ? undefined : traces.get(storeId);
        return { sessionId, turn, ...(trace ? { trace } : {}) };
      }),
      questions,
      items: memory.store.listItems({ statuses: ["active"], limit: 100_000 }).length,
      ingestMs,
      embedMs: embedder.totalMs,
    };
  } finally {
    await service.stop();
    memory.close();
  }
}
