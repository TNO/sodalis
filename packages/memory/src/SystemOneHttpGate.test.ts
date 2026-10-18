import { describe, expect, it } from "vitest";
import { MEMORY_GATE_QUESTIONS, memoryGateVerdict, SystemOneHttpGate } from "./index.js";

function fakeFetch(reply: unknown, seen: { url?: string; body?: Record<string, unknown> }, status = 200): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify(reply), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("SystemOneHttpGate", () => {
  it("asks all memory questions in one /v1/systemone call and maps the answers", async () => {
    const seen: { url?: string; body?: Record<string, unknown> } = {};
    const gate = new SystemOneHttpGate({
      baseUrl: "http://localhost:8899/",
      model: "vllm-sr/Vela-2.0-0.3B",
      fetch: fakeFetch(
        {
          answers: {
            memory_worthy: { type: "noul", noul: 0.83 },
            kind: { type: "choice", choice: "person", confidence: 0.6, probabilities: { person: 0.7, fact: 0.3 } },
            is_correction: { type: "noul", noul: 0.04 },
          },
        },
        seen,
      ),
    });

    const response = await gate.decide({ state: "User (latest message): Mijn dochter heet Anna.", questions: MEMORY_GATE_QUESTIONS });

    expect(seen.url).toBe("http://localhost:8899/v1/systemone");
    expect(seen.body?.model).toBe("vllm-sr/Vela-2.0-0.3B");
    expect(seen.body?.state).toBe("User (latest message): Mijn dochter heet Anna.");
    const questions = seen.body?.questions as Record<string, Record<string, unknown>>;
    expect(questions.memory_worthy).toMatchObject({ type: "noul" });
    expect(questions.kind?.type).toBe("choice");
    expect(Object.keys(questions.kind?.criteria as object)).toEqual(MEMORY_GATE_QUESTIONS[1]!.type === "choice" ? [...MEMORY_GATE_QUESTIONS[1]!.choices] : []);
    expect(memoryGateVerdict(response, 0.1)).toEqual({ worthy: true, worthyProbability: 0.83, kind: "person", isCorrection: false });
    expect(gate.stats.calls).toBe(1);
  });

  it("reports server errors and counts the failure", async () => {
    const gate = new SystemOneHttpGate({ baseUrl: "http://x", model: "m", fetch: fakeFetch({ error: "boom" }, {}, 500) });
    await expect(gate.decide({ state: "s", questions: MEMORY_GATE_QUESTIONS })).rejects.toThrow(/500/);
    expect(gate.stats.failures).toBe(1);
  });

  it("rejects a response that misses a question", async () => {
    const gate = new SystemOneHttpGate({
      baseUrl: "http://x",
      model: "m",
      fetch: fakeFetch({ answers: { memory_worthy: { type: "noul", noul: 0.5 } } }, {}),
    });
    await expect(gate.decide({ state: "s", questions: MEMORY_GATE_QUESTIONS })).rejects.toThrow(/kind/);
  });
});
