import { describe, expect, it } from "vitest";
import { MockEmbedder, PassThroughGate, type ChatClient, type ChatCompletionRequest } from "../src/index.js";
import { fact, ScriptedExtractor, ScriptedReconciler } from "../src/testing.js";
import { parseLoCoMo, parseLoCoMoDate, parseLongMemEval, parseLongMemEvalDate, translateCase } from "./benchmarks.js";
import { containsKeywords } from "./cases.js";
import { assertLocalOnly, isLocalUrl, rolesFromEnv } from "./config.js";
import { runCase, type CaseResult } from "./harness.js";
import { benchmarkIndex } from "./indexBench.js";
import { componentMetrics, qaMetrics } from "./metrics.js";
import { FIXTURE_PERSONAS, personaFromRow } from "./personas.js";
import { Random } from "./random.js";
import { LlmRenderer, renderScenario, TemplateRenderer } from "./render.js";
import { generateScenario } from "./scenario.js";

const persona = FIXTURE_PERSONAS[0]!;

function client(reply: (request: ChatCompletionRequest) => string, id = "fake"): ChatClient & { requests: ChatCompletionRequest[] } {
  const requests: ChatCompletionRequest[] = [];
  return {
    id,
    requests,
    async complete(request) {
      requests.push(request);
      return { content: reply(request) };
    },
  };
}

describe("synthetic scenarios", () => {
  it("are reproducible for a seed and differ between seeds", () => {
    expect(generateScenario(persona, 1)).toEqual(generateScenario(persona, 1));
    expect(generateScenario(persona, 2)).not.toEqual(generateScenario(persona, 1));
    expect(new Random(5).next()).toBe(new Random(5).next());
  });

  it("derive consistent labels and answers from the event graph", () => {
    const scenario = generateScenario(persona, 3, { sessions: 6 });
    const sessionOf = (id: string) => scenario.sessions.findIndex((session) => session.events.includes(id));
    const events = Object.values(scenario.events);
    expect(events.map((event) => sessionOf(event.id))).not.toContain(-1);
    for (const event of events) {
      expect(event.worthy).toBe(event.kind !== "distractor");
      if (event.worthy) expect(event.expected?.keywords.length).toBeGreaterThan(0);
      if (event.target) expect(sessionOf(event.target)).toBeLessThan(sessionOf(event.id));
      if (event.expected) expect(containsKeywords(event.say, event.expected.keywords)).toBe(true);
    }
    expect(events.find((event) => event.kind === "health")?.expected?.sensitivity).toBe("health");
    expect(events.filter((event) => event.kind === "transient").every((event) => event.expected?.layer === "L3")).toBe(true);
    for (const question of scenario.questions.filter((question) => !question.abstain)) {
      expect(events.some((event) => containsKeywords(event.say, question.keywords!))).toBe(true);
    }
    expect(scenario.questions.map((question) => question.type)).toEqual(
      expect.arrayContaining(["single-session", "knowledge-update", "temporal", "health", "routine", "abstention"]),
    );
  });

  it("render with a template, one event per user turn", async () => {
    const scenario = generateScenario(persona, 1);
    const evalCase = await renderScenario(scenario, new TemplateRenderer());
    const userTurns = evalCase.sessions.flatMap((session) => session.turns.filter((turn) => turn.role === "user"));
    expect(userTurns).toHaveLength(Object.keys(scenario.events).length);
    expect(evalCase.source).toContain("CC-BY-4.0");
  });

  it("regenerate sessions the judge rejects and fall back to templates", async () => {
    const scenario = generateScenario(persona, 1);
    const events = scenario.sessions[0]!.events;
    const turns = events.flatMap((id) => [
      { role: "user", text: scenario.events[id]!.say, events: [id] },
      { role: "assistant", text: "Fijn." },
    ]);
    const writer = client(() => JSON.stringify({ turns }));
    let verdicts = 0;
    const judge = client(() => {
      verdicts += 1;
      return JSON.stringify({ results: events.map((id) => ({ id, present: verdicts > 1 })) });
    });
    const renderer = new LlmRenderer(writer, judge, 2);
    expect(await renderer.renderSession(scenario, 0)).toHaveLength(turns.length);
    expect(writer.requests).toHaveLength(2);

    const failing = new LlmRenderer(client(() => "{}"), judge, 2);
    const fallback = await failing.renderSession(scenario, 0);
    expect(fallback[0]?.text).toBe(scenario.events[events[0]!]!.say);
    expect(failing.failures).toEqual([{ scenario: scenario.id, session: 0 }]);
  });
});

describe("evaluation harness", () => {
  it("ingests through the service, answers from memory, and scores against the graph", async () => {
    const scenario = generateScenario(persona, 1, { sessions: 4 });
    const evalCase = await renderScenario(scenario, new TemplateRenderer());
    const echo = client((request) => String(request.messages[0]!.content));
    const result = await runCase(evalCase, {
      embedder: new MockEmbedder(),
      gate: new PassThroughGate(),
      extractor: new ScriptedExtractor(({ userTurn }) => [
        fact(userTurn, {
          sensitivity: /pil|cholesterol/.test(userTurn) ? "health" : "general",
          transient: /vandaag/.test(userTurn),
        }),
      ]),
      reconciler: new ScriptedReconciler(() => ({ action: "ADD" })),
      answer: echo,
    });
    const components = componentMetrics([result], () => scenario.events);
    expect(components.gate.recall).toBe(1);
    expect(components.gate.precision).toBeLessThan(1);
    expect(components.extraction.recall).toBe(1);
    expect(components.healthLabel.rate).toBe(1);
    expect(components.reconciliation.byAction.ADD!.rate).toBe(1);
    expect(components.reconciliation.byAction["UPDATE|SUPERSEDE"]!.rate).toBe(0);
    const qa = qaMetrics([result]);
    expect(qa.overall.total).toBe(scenario.questions.length);
    expect(qa.byType.health!.rate).toBe(1);
    expect(qa.memoryTokens).toBeGreaterThan(0);
  });

  it("computes gate and extraction metrics for skipped and noisy turns", () => {
    const result: CaseResult = {
      caseId: "c",
      items: 0,
      ingestMs: 0,
      embedMs: 0,
      questions: [],
      turns: [
        { sessionId: "s", turn: { role: "user", text: "a", events: ["e1"] }, trace: { turnId: 1, role: "user", extracted: [], droppedHealth: 0, droppedObservationHealth: 0, decisions: [], gate: { worthy: false, worthyProbability: 0.1, kind: "none", isCorrection: false } } },
        { sessionId: "s", turn: { role: "user", text: "b", events: ["e2"] }, trace: { turnId: 2, role: "user", extracted: [fact("weer")], droppedHealth: 0, droppedObservationHealth: 0, decisions: [{ action: "ADD", layer: "L2" }], gate: { worthy: true, worthyProbability: 0.9, kind: "fact", isCorrection: false } } },
      ],
    };
    const metrics = componentMetrics([result], () => ({
      e1: { id: "e1", kind: "pet", say: "", worthy: true, expected: { layer: "L4", subject: "Bello", keywords: ["Bello"], sensitivity: "general", transient: false } },
      e2: { id: "e2", kind: "distractor", say: "", worthy: false },
    }));
    expect(metrics.gate).toMatchObject({ truePositive: 0, falsePositive: 1, falseNegative: 1 });
    expect(metrics.extraction).toMatchObject({ precision: 0, recall: 0, extracted: 1, expected: 1 });
  });
});

describe("benchmark loaders", () => {
  it("parse LongMemEval records chronologically and keep evidence sessions", () => {
    const record = {
      question_id: "q1_abs",
      question_type: "knowledge-update",
      question: "Where do I live?",
      answer: "Delft",
      question_date: "2023/05/01 (Mon) 10:00",
      haystack_dates: ["2023/04/10 (Mon) 17:50", "2023/04/01 (Sat) 09:05", "2023/04/03 (Mon) 08:00"],
      haystack_session_ids: ["a", "b", "c"],
      haystack_sessions: [
        [{ role: "user", content: "I moved to Delft." }, { role: "assistant", content: "Nice!" }],
        [{ role: "user", content: "Hello" }],
        [{ role: "user", content: "Cats?" }],
      ],
      answer_session_ids: ["a"],
    };
    const [evalCase] = parseLongMemEval([record], { distractorSessions: 1 });
    expect(evalCase!.sessions).toHaveLength(2);
    expect(evalCase!.sessions.map((session) => session.id)).toContain("a");
    expect(evalCase!.sessions[0]!.date < evalCase!.sessions[1]!.date).toBe(true);
    expect(evalCase!.questions[0]).toMatchObject({ type: "abstention", abstain: true, askedAt: "2023-05-01T10:00:00.000Z" });
    expect(parseLongMemEvalDate("2023/04/10 (Mon) 17:50")).toBe("2023-04-10T17:50:00.000Z");
  });

  it("parse LoCoMo conversations and skip adversarial questions", () => {
    const [evalCase] = parseLoCoMo([
      {
        sample_id: "conv-1",
        conversation: {
          speaker_a: "Caroline",
          speaker_b: "Melanie",
          session_1_date_time: "1:56 pm on 8 May, 2023",
          session_1: [{ speaker: "Caroline", text: "I went to a support group." }],
        },
        qa: [
          { question: "When?", answer: "7 May 2023", category: 2 },
          { question: "Trick?", category: 5 },
        ],
      },
    ]);
    expect(evalCase!.sessions[0]!.turns[0]).toEqual({ role: "user", text: "Caroline: I went to a support group." });
    expect(evalCase!.questions).toHaveLength(1);
    expect(evalCase!.questions[0]!.type).toBe("temporal");
    expect(parseLoCoMoDate("12:05 am on 1 January, 2024")).toBe("2024-01-01T00:05:00.000Z");
  });

  it("translate cases in batches and keep the structure", async () => {
    const translator = client((request) => {
      const { texts } = JSON.parse(String(request.messages[1]!.content)) as { texts: string[] };
      return JSON.stringify({ texts: texts.map((text) => `NL ${text}`) });
    });
    const [evalCase] = parseLongMemEval([
      {
        question_id: "q",
        question_type: "single-session-user",
        question: "Q?",
        answer: "A",
        question_date: "2023/05/01 (Mon) 10:00",
        haystack_dates: ["2023/04/10 (Mon) 17:50"],
        haystack_session_ids: ["a"],
        haystack_sessions: [[{ role: "user", content: "Hi" }]],
      },
    ]);
    const translated = await translateCase(evalCase!, translator);
    expect(translated.language).toBe("nl");
    expect(translated.sessions[0]!.turns[0]!.text).toBe("NL Hi");
    expect(translated.questions[0]).toMatchObject({ question: "NL Q?", answer: "NL A" });
  });
});

describe("evaluation config", () => {
  it("requires --allow-cloud for remote model URLs", () => {
    expect(isLocalUrl("http://127.0.0.1:11434/v1")).toBe(true);
    expect(isLocalUrl("https://example.openai.azure.com")).toBe(false);
    const env = { EVAL_EXTRACT_BASE_URL: "https://example.openai.azure.com", EVAL_EXTRACT_MODEL: "gpt", EVAL_EMBED_PROVIDER: "mock" };
    expect(() => assertLocalOnly(env, ["EXTRACT", "ANSWER"], false)).toThrow(/consent/);
    expect(() => assertLocalOnly(env, ["EXTRACT"], true)).not.toThrow();
  });

  it("falls back to the extraction model for answering and to a pass-through gate", () => {
    const { roles } = rolesFromEnv({ EVAL_EXTRACT_BASE_URL: "http://localhost:1/v1", EVAL_EXTRACT_MODEL: "m", EVAL_EMBED_PROVIDER: "mock" });
    expect(roles.answer.id).toBe("answer:m");
    expect(roles.gate).toBeInstanceOf(PassThroughGate);
    expect(roles.judge).toBeUndefined();
  });

  it("reads persona rows", () => {
    expect(personaFromRow({ uuid: "u", persona: "Ilse Sebrechts is ...", sex: "Vrouw", age: "74", hobbies_and_interests_list: '["Lezen"]' })).toMatchObject({
      firstName: "Ilse",
      age: 74,
      hobbies: ["Lezen"],
    });
  });
});

describe("index benchmark", () => {
  it("reports latency percentiles", async () => {
    const result = await benchmarkIndex({ items: 50, dimensions: 16, queries: 5 });
    expect(result.items).toBe(50);
    expect(result.vector.p95).toBeGreaterThanOrEqual(result.vector.p50);
  });
});
