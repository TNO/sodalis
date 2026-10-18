import { describe, expect, it } from "vitest";
import { MockEmbedder, PassThroughGate, SystemOneHttpGate, type ChatClient, type ChatCompletionRequest } from "../src/index.js";
import { fact, ScriptedExtractor, ScriptedInducer, ScriptedReconciler } from "../src/testing.js";
import { parseCsv, parseLoCoMo, parseLoCoMoDate, parseLongMemEval, parseLongMemEvalDate, parsePersonaMem, selectPersonaMemRows, translateCase } from "./benchmarks.js";
import { containsKeywords, type EvalCase } from "./cases.js";
import { assertLocalOnly, isLocalUrl, rolesFromEnv } from "./config.js";
import { rejudge, runCase, type CaseResult, type EvalRoles } from "./harness.js";
import { benchmarkIndex } from "./indexBench.js";
import { componentMetrics, qaMetrics } from "./metrics.js";
import { TransformersEmbedder } from "./transformersEmbedder.js";
import { FIXTURE_PERSONAS, personaFromRow } from "./personas.js";
import { Random } from "./random.js";
import { LlmRenderer, renderScenario, TemplateRenderer } from "./render.js";
import { dutchDate, generateScenario } from "./scenario.js";

const persona = FIXTURE_PERSONAS[0]!;

function roles(overrides: Partial<EvalRoles> = {}): EvalRoles {
  return {
    embedder: new MockEmbedder(),
    gate: new PassThroughGate(),
    extractor: new ScriptedExtractor(({ userTurn }) => [fact(userTurn)]),
    reconciler: new ScriptedReconciler(() => ({ action: "ADD" })),
    answer: client(() => ""),
    ...overrides,
  };
}

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
      expect.arrayContaining(["single-session", "knowledge-update", "temporal", "health", "routine", "abstention", "intention", "recall"]),
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

  it("plants an intention and a Saturday routine, and asks about a dated mood", () => {
    const scenario = generateScenario(persona, 7);
    const events = Object.values(scenario.events);
    expect(events.filter((event) => event.kind === "intention").every((event) => event.expected?.layer === "L7")).toBe(true);
    expect(events.filter((event) => event.kind === "intention").length).toBeGreaterThanOrEqual(2);
    expect(events.filter((event) => event.kind === "routine" && event.say.includes("markt")).length).toBeGreaterThanOrEqual(2);
    const recall = scenario.questions.find((question) => question.type === "recall")!;
    const mood = events.find((event) => event.kind === "transient" && event.say.toLowerCase().includes(recall.keywords![0]!))!;
    const session = scenario.sessions.find((candidate) => candidate.events.includes(mood.id))!;
    expect(recall.question).toContain(dutchDate(session.date, true));
  });

  it("parses quoted CSV fields with commas, quotes, and newlines", () => {
    expect(parseCsv('a,b\n1,"x, ""y""\nz"\r\n2,\n')).toEqual([
      { a: "1", b: 'x, "y"\nz' },
      { a: "2", b: "" },
    ]);
  });

  it("turns PersonaMem-v2 histories into dated sessions with shuffled multiple-choice questions", () => {
    const row = (persona: string, query: string, correct: string) => ({
      persona_id: persona,
      chat_history_32k_link: `data/h${persona}.json`,
      user_query: query,
      correct_answer: correct,
      incorrect_answers: JSON.stringify(["Wrong one.", "Wrong two.", "Wrong three."]),
      pref_type: "neutral_preferences",
    });
    const rows = [
      row("1", `{'role': 'user', 'content': 'What\\'s a good hobby?'}`, "Painting."),
      row("2", `{'role': 'user', 'content': 'Snack?'}`, "Nuts."),
      row("2", `{"role": "user", "content": "Drink?"}`, "Tea."),
    ];
    expect(selectPersonaMemRows(rows, 1).map((selected) => selected.persona_id)).toEqual(["2", "2"]);
    const turns = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `turn ${index}` }));
    const history = { chat_history: [{ role: "system", content: "Persona: secret" }, ...turns] };
    const [evalCase] = parsePersonaMem(selectPersonaMemRows(rows, 1), (link) => (link === "data/h2.json" ? history : undefined), { seed: 1 });
    expect(evalCase!.source).toContain("CC BY 4.0");
    expect(JSON.stringify(evalCase!.sessions)).not.toContain("secret");
    expect(evalCase!.sessions).toHaveLength(2);
    expect(Date.parse(evalCase!.sessions[1]!.date)).toBeGreaterThan(Date.parse(evalCase!.sessions[0]!.date));
    expect(evalCase!.sessions[0]!.turns[1]).toEqual({ role: "assistant", text: "turn 1" });
    const [snack, drink] = evalCase!.questions;
    expect(snack!.question).toBe("Snack?");
    expect(drink!.question).toBe("Drink?");
    expect(snack!.type).toBe("neutral_preferences");
    expect(snack!.choices).toHaveLength(4);
    expect(snack!.choices!["ABCD".indexOf(snack!.answer)]).toBe("Nuts.");
    expect(Date.parse(snack!.askedAt)).toBeGreaterThan(Date.parse(evalCase!.sessions[1]!.date));
  });

  it("truncates and renormalises transformers.js embeddings", async () => {
    const embedder = new TransformersEmbedder({
      model: "granite",
      dimensions: 2,
      extract: async (texts) => texts.map(() => [3, 4, 12]),
    });
    const [vector] = await embedder.embed(["a"]);
    expect(embedder.descriptor).toEqual({ model: "granite", dimensions: 2 });
    expect([...vector!].map((value) => value.toFixed(2))).toEqual(["0.60", "0.80"]);
  });

  it("lets the answer model recall transcripts in a second pass", async () => {
    const evalCase: EvalCase = {
      id: "recall",
      source: "test",
      language: "nl",
      sessions: [{ id: "s1", date: "2026-01-06T10:00:00.000Z", turns: [{ role: "user", text: "Mijn rug doet vandaag pijn." }] }],
      questions: [{ id: "q1", type: "recall", question: "Wat zei ik op 6 januari?", answer: "rug", keywords: ["rug"], askedAt: "2026-01-10T10:00:00.000Z" }],
    };
    const answer = client((request) => {
      const system = String(request.messages[0]!.content);
      return system.includes("Recalled from")
        ? system.split("\n").find((line) => line.includes("rug"))!
        : '{"recall_memory":{"query":"rug","from":"2026-01-06","to":"2026-01-06"}}';
    });
    const result = await runCase(evalCase, roles({ extractor: new ScriptedExtractor(() => []), answer }));
    expect(answer.requests).toHaveLength(2);
    expect(String(answer.requests[0]!.messages[0]!.content)).toContain("recall_memory");
    const first = String(answer.requests[0]!.messages[0]!.content);
    expect(first).not.toContain("Staat het antwoord er niet in");
    expect(first).toContain("Staat het antwoord niet in het geheugen en ook niet in een recall_memory-zoekopdracht");
    expect(result.questions[0]).toMatchObject({ correct: true, recall: { query: "rug", from: "2026-01-06", excerpts: 1 } });
    expect(qaMetrics([result]).recall).toEqual({ correct: 1, total: 1, rate: 1 });
  });

  it("grades multiple-choice questions by the chosen letter", async () => {
    const evalCase: EvalCase = {
      id: "mc",
      source: "test",
      language: "en",
      sessions: [{ id: "s1", date: "2026-01-06T10:00:00.000Z", turns: [{ role: "user", text: "I do yoga every morning." }] }],
      questions: [
        { id: "q1", type: "preference", question: "Morning tips?", answer: "B", choices: ["Run.", "Yoga.", "Sleep.", "Coffee."], askedAt: "2026-01-10T10:00:00.000Z" },
        { id: "q2", type: "preference", question: "Evening tips?", answer: "C", choices: ["Run.", "Yoga.", "Sleep.", "Coffee."], askedAt: "2026-01-10T10:00:00.000Z" },
      ],
    };
    const answer = client(() => "B");
    const result = await runCase(evalCase, roles({ answer }));
    expect(String(answer.requests[0]!.messages.at(-1)!.content)).toContain("B. Yoga.");
    expect(result.questions.map((question) => question.correct)).toEqual([true, false]);
  });

  it("answers without memory for a no-memory baseline", async () => {
    const evalCase: EvalCase = {
      id: "baseline",
      source: "test",
      language: "en",
      sessions: [{ id: "s1", date: "2026-01-06T10:00:00.000Z", turns: [{ role: "user", text: "I do yoga every morning." }] }],
      questions: [{ id: "q1", type: "preference", question: "Morning tips?", answer: "B", choices: ["Run.", "Yoga.", "Sleep.", "Coffee."], askedAt: "2026-01-10T10:00:00.000Z" }],
    };
    const extractor = new ScriptedExtractor(() => [fact("De gebruiker doet yoga.")]);
    const answer = client(() => "B");
    let embedCalls = 0;
    const embedder = new MockEmbedder();
    const countingEmbedder = Object.assign(Object.create(embedder) as MockEmbedder, {
      embed: (texts: readonly string[]) => {
        embedCalls++;
        return embedder.embed(texts);
      },
    });
    const result = await runCase(evalCase, roles({ extractor, answer, embedder: countingEmbedder }), { ingest: false });
    expect(embedCalls).toBe(0);
    expect(extractor.requests).toHaveLength(0);
    expect(result.turns).toHaveLength(0);
    expect(String(answer.requests[0]!.messages[0]!.content)).not.toContain("recall_memory");
    expect(result.questions[0]).toMatchObject({ correct: true, memoryTokens: 0 });
  });

  it("answers before and after System 2 from one ingest when comparing", async () => {
    const scenario = generateScenario(persona, 1, { sessions: 4 });
    const evalCase = await renderScenario(scenario, new TemplateRenderer());
    const inducer = new ScriptedInducer((cluster) =>
      cluster.length >= 2 ? [{ layer: "L6", subject: "user", text: "Wandelt vaak in het park.", evidence: cluster.slice(0, 2).map((item) => item.id) }] : [],
    );
    const answer = client((request) => String(request.messages[0]!.content));
    const result = await runCase(evalCase, roles({ answer, inducer }), { system2: "compare" });
    expect(result.questions).toHaveLength(scenario.questions.length);
    expect(result.questionsSystem2).toHaveLength(scenario.questions.length);
    expect(result.questions.some((question) => question.memory.includes("Wandelt vaak"))).toBe(false);
    expect(result.questionsSystem2!.some((question) => question.memory.includes("Wandelt vaak"))).toBe(true);
    expect(qaMetrics([result], "system2").overall.total).toBe(scenario.questions.length);
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

  it("samples LongMemEval questions per type", () => {
    const record = (id: string, type: string) => ({
      question_id: id,
      question_type: type,
      question: "Q?",
      answer: "A",
      question_date: "2023/05/01 (Mon) 10:00",
      haystack_dates: ["2023/04/10 (Mon) 17:50"],
      haystack_session_ids: ["a"],
      haystack_sessions: [[{ role: "user", content: "Hi" }]],
    });
    const records = [
      ...["1", "2", "3"].map((id) => record(`k${id}`, "knowledge-update")),
      ...["1", "2", "3"].map((id) => record(`t${id}`, "temporal-reasoning")),
      record("s1", "single-session-assistant"),
    ];
    const cases = parseLongMemEval(records, { perType: 2, types: ["knowledge-update", "temporal-reasoning"] });
    expect(cases.map((evalCase) => evalCase.questions[0]!.type).sort()).toEqual([
      "knowledge-update",
      "knowledge-update",
      "temporal-reasoning",
      "temporal-reasoning",
    ]);
  });

  it("truncates assistant turns and retries a failed batch one text at a time", async () => {
    const translator = client((request) => {
      const { texts } = JSON.parse(String(request.messages[1]!.content)) as { texts: string[] };
      return JSON.stringify({ texts: (texts.length > 1 ? texts.slice(1) : texts).map((text) => `NL ${text}`) });
    });
    const evalCase: EvalCase = {
      id: "c",
      source: "test",
      language: "en",
      sessions: [
        {
          id: "s",
          date: "2023-04-10T17:50:00.000Z",
          turns: [
            { role: "user", text: "Hi" },
            { role: "assistant", text: "x".repeat(50) },
          ],
        },
      ],
      questions: [{ id: "q", type: "t", question: "Q?", answer: "A", askedAt: "2023-05-01T10:00:00.000Z" }],
    };
    const translated = await translateCase(evalCase, translator, { assistantChars: 10 });
    expect(translated.sessions[0]!.turns.map((turn) => turn.text)).toEqual(["NL Hi", `NL ${"x".repeat(9)}…`]);
    expect(translated.questions[0]).toMatchObject({ question: "NL Q?", answer: "NL A" });
  });

  it("splits oversized messages into bounded translation requests", async () => {
    const requestSizes: number[] = [];
    const translator = client((request) => {
      const { texts } = JSON.parse(String(request.messages[1]!.content)) as { texts: string[] };
      requestSizes.push(...texts.map((text) => text.length));
      return JSON.stringify({ texts });
    });
    const text = "A long sentence. ".repeat(300);
    const evalCase: EvalCase = {
      id: "long",
      source: "test",
      language: "en",
      sessions: [{ id: "s", date: "2023-04-10T17:50:00.000Z", turns: [{ role: "user", text }] }],
      questions: [{ id: "q", type: "t", question: "Q?", answer: "A", askedAt: "2023-05-01T10:00:00.000Z" }],
    };
    const translated = await translateCase(evalCase, translator);
    expect(requestSizes.every((size) => size <= 500)).toBe(true);
    expect(translated.sessions[0]!.turns[0]!.text).toBe(text);
  });

  it("re-grades free-form answers and never lets the judge accept a non-answer", async () => {
    const judged: string[] = [];
    const judge = client((request) => {
      judged.push(String(request.messages[1]!.content));
      return '{"correct": true}';
    });
    const result = (question: string, answer: string, correct: boolean, extra: Record<string, unknown> = {}) => ({
      question: { id: question, type: "t", question, answer: "A", askedAt: "2026-01-01T00:00:00.000Z", ...extra },
      answer,
      correct,
      memory: "",
      memoryTokens: 0,
      retrieveMs: 0,
    });
    const results = [
      {
        caseId: "c",
        turns: [],
        items: 0,
        ingestMs: 0,
        embedMs: 0,
        questions: [
          result("free wrong", "x", false),
          result("free right", "A", true),
          result("choice wrong", "x", false, { choices: ["a", "b"] }),
          result("non-answer", "Dat weet ik niet.", true),
          result("abstention", "Dat heb je me niet verteld.", false, { abstain: true }),
          result("hedged", "I am not sure, but it is A.", false),
        ],
        questionsSystem2: [result("s2 wrong", "x", false)],
      },
    ] as unknown as CaseResult[];
    const { results: regraded, changed } = await rejudge(results, judge);
    expect(judged).toHaveLength(4);
    expect(JSON.parse(judged[0]!)).toEqual({ question: "free wrong", reference: "A", answer: "x" });
    expect(results[0]!.questions[0]!.correct).toBe(false);
    expect(regraded[0]!.questions.map((question) => [question.correct, question.regraded])).toEqual([
      [true, true],
      [true, undefined],
      [false, undefined],
      [false, true],
      [true, true],
      [true, true],
    ]);
    expect(regraded[0]!.questionsSystem2![0]).toMatchObject({ correct: true, regraded: true });
    expect(changed).toBe(5);
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

  it("builds only answer and judge roles for no-memory runs", () => {
    const { roles } = rolesFromEnv(
      { EVAL_ANSWER_BASE_URL: "http://localhost:1/v1", EVAL_ANSWER_MODEL: "answer", EVAL_EMBED_BASE_URL: "https://unused.example", EVAL_EMBED_MODEL: "unused" },
      { memoryEnabled: false },
    );
    expect(roles.answer.id).toBe("answer:answer");
    expect(roles.embedder).toBeInstanceOf(MockEmbedder);
    expect(roles.judge).toBeUndefined();
    expect(() => assertLocalOnly(
      { EVAL_ANSWER_BASE_URL: "http://localhost:1/v1", EVAL_ANSWER_MODEL: "answer", EVAL_EMBED_BASE_URL: "https://unused.example", EVAL_EMBED_MODEL: "unused" },
      ["ANSWER"], false,
      { includeEmbedder: false },
    )).not.toThrow();
  });

  it("falls back to the extraction model for answering and to a pass-through gate", () => {
    const { roles } = rolesFromEnv({ EVAL_EXTRACT_BASE_URL: "http://localhost:1/v1", EVAL_EXTRACT_MODEL: "m", EVAL_EMBED_PROVIDER: "mock" });
    expect(roles.answer.id).toBe("answer:m");
    expect(roles.gate).toBeInstanceOf(PassThroughGate);
    expect(roles.judge).toBeUndefined();
  });

  it("uses a System One HTTP gate when selected and reports its stats", () => {
    const { roles, stats } = rolesFromEnv({
      EVAL_GATE_PROVIDER: "systemone",
      EVAL_GATE_BASE_URL: "http://localhost:8899",
      EVAL_GATE_MODEL: "vllm-sr/Vela-2.0-0.3B",
      EVAL_EXTRACT_BASE_URL: "http://localhost:1/v1",
      EVAL_EXTRACT_MODEL: "m",
      EVAL_EMBED_PROVIDER: "mock",
    });
    expect(roles.gate).toBeInstanceOf(SystemOneHttpGate);
    expect(roles.gate.id).toBe("systemone:vllm-sr/Vela-2.0-0.3B");
    expect(stats().gate).toMatchObject({ calls: 0, failures: 0 });
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
