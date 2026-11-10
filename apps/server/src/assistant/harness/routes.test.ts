import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  InMemoryCredentialStore,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { MemoryService } from "@sodalis/memory";
import { readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAssistantApp } from "../app.js";
import { literalConfigValue } from "./companionModel.js";
import { createCompanionSession } from "./companionSession.js";
import { createCompanionHarnessFromEnv } from "./config.js";
import type { HomeGraph } from "./homeGraph.js";
import { createHomeTools } from "./tools.js";
import type { CompanionAuditEvent } from "./audit.js";
import { CompanionWorkflows } from "./workflow.js";

const start = {
  sessionId: "session-1",
  workflowId: "workflow-1",
  inputId: "input-1",
  messages: [{ role: "user", content: "Hoe warm is het in de slaapkamer?" }],
};

function post(app: ReturnType<typeof createAssistantApp>, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function events(text: string) {
  return text
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => JSON.parse(frame.slice(6)) as Record<string, unknown>);
}

/** Workflows whose first tool call blocks until `release` is called. */
async function blockedWorkflows(auditEvents?: CompanionAuditEvent[]) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markStarted!: () => void;
  const toolStarted = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const graph: HomeGraph = {
    findEntities: vi.fn(async () => {
      markStarted();
      await released;
      return { status: "not_found" as const };
    }),
    inspectNeighborhood: vi.fn(),
    resolveReference: vi.fn(),
    close: async () => {},
  };
  const faux = fauxProvider();
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("find_entities", { query: "slaapkamer" })),
    fauxAssistantMessage(fauxText("Ik kan de slaapkamer niet vinden. In de keuken weet ik het ook niet.")),
  ]);
  const workflows = new CompanionWorkflows({
    ...(auditEvents ? { audit: { write: (event: CompanionAuditEvent) => { auditEvents.push(event); } } } : {}),
    createSession: ({ history, budget }) =>
      createCompanionSession({
        model: { modelRuntime, model: faux.getModel(), thinkingLevel: "off" },
        history,
        tools: createHomeTools({ graph, budget }),
      }),
  });
  return { workflows, release, toolStarted };
}

describe("companion workflow routes", () => {
  it("advertises only the selected runtime mode, without credentials or provider settings", async () => {
    const turn = await createAssistantApp().request("/api/assistant/config");
    expect(turn.headers.get("cache-control")).toBe("no-store");
    expect(await turn.json()).toEqual({ mode: "turn" });
    const companion = (await createCompanionHarnessFromEnv({ COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock" }))!;
    const workflow = await createAssistantApp({ workflows: companion }).request("/api/assistant/config");
    expect(await workflow.json()).toEqual({ mode: "workflow" });
  });

  it("are off unless COMPANION_HARNESS=pi", async () => {
    expect(await createCompanionHarnessFromEnv({ LLM_PROVIDER: "mock" })).toBeUndefined();
    const app = createAssistantApp();
    expect((await post(app, "/api/assistant/workflows", start)).status).toBe(404);
  });

  it("does not register email account authorization routes in mock mode", async () => {
    const workflows = (await createCompanionHarnessFromEnv({
      COMPANION_HARNESS: "pi",
      EMAIL_PROVIDER: "mock",
      LLM_PROVIDER: "mock",
    }))!;
    const app = createAssistantApp({ workflows });

    for (const [path, method] of [
      ["/api/email/connection", "GET"],
      ["/api/email/connect", "POST"],
      ["/api/email/callback", "GET"],
      ["/api/email/connection", "DELETE"],
    ] as const) {
      expect((await app.request(path, { method })).status).toBe(404);
    }
  });

  it("streams a lifecycle with the mock model and no graph", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const companion = (await createCompanionHarnessFromEnv({ COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock" }))!;
    expect(warn).toHaveBeenCalled();
    const app = createAssistantApp({ workflows: companion });
    const response = await post(app, "/api/assistant/workflows", start);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(response.headers.get("x-sodalis-workflow-id")).toBe("workflow-1");
    expect(events(await response.text())).toEqual([
      { type: "started", workflowId: "workflow-1", sequence: 0 },
      { type: "answer", workflowId: "workflow-1", sequence: 1, inputId: "input-1", text: "Dit is een testantwoord." },
    ]);
  });

  it("validates workflow, steering and cancel requests", async () => {
    const { workflows } = await blockedWorkflows();
    const app = createAssistantApp({ workflows });
    expect((await post(app, "/api/assistant/workflows", { ...start, workflowId: "bad id" })).status).toBe(400);
    expect((await post(app, "/api/assistant/workflows", { ...start, messages: [{ role: "assistant", content: "x" }] })).status).toBe(400);
    expect((await post(app, "/api/assistant/workflows/workflow-1/steer", { inputId: "input-2", text: " " })).status).toBe(400);
    expect((await post(app, "/api/assistant/workflows/workflow-1/steer", { inputId: "input-2", text: "Hallo" })).status).toBe(409);
    expect(await (await post(app, "/api/assistant/workflows/workflow-1/cancel", {})).json()).toEqual({ status: "not_running" });
  });

  it("accepts steering for a running workflow and answers the latest input", async () => {
    const { workflows, release, toolStarted } = await blockedWorkflows();
    const app = createAssistantApp({ workflows });
    const response = await post(app, "/api/assistant/workflows", start);
    await toolStarted;
    expect((await post(app, "/api/assistant/workflows", { ...start, workflowId: "workflow-2" })).status).toBe(409);
    const steer = await post(app, "/api/assistant/workflows/workflow-1/steer", { inputId: "input-2", text: "En in de keuken?" });
    expect(steer.status).toBe(202);
    expect(await steer.json()).toEqual({ status: "accepted" });
    expect(await (await post(app, "/api/assistant/workflows/workflow-1/steer", { inputId: "input-2", text: "En in de keuken?" })).json())
      .toEqual({ status: "duplicate" });
    release();
    expect(events(await response.text()).at(-1)).toMatchObject({ type: "answer", inputId: "input-2" });
  });

  it("cancels a running workflow with a terminal stream event", async () => {
    const { workflows, release, toolStarted } = await blockedWorkflows();
    const app = createAssistantApp({ workflows });
    const response = await post(app, "/api/assistant/workflows", start);
    await toolStarted;
    const cancel = await post(app, "/api/assistant/workflows/workflow-1/cancel", {});
    expect(await cancel.json()).toEqual({ status: "cancelled" });
    release();
    expect(events(await response.text())).toEqual([
      { type: "started", workflowId: "workflow-1", sequence: 0 },
      { type: "cancelled", workflowId: "workflow-1", sequence: 1 },
    ]);
  });

  it("keeps internal audit events out of resident SSE", async () => {
    const auditEvents: CompanionAuditEvent[] = [];
    const { workflows, release, toolStarted } = await blockedWorkflows(auditEvents);
    const memory = {
      recordUserTurn: vi.fn(),
      recordAssistantTurn: vi.fn(),
      retrieve: vi.fn(),
      recall: vi.fn(),
    } as unknown as MemoryService;
    const app = createAssistantApp({ workflows, memory });
    const response = await post(app, "/api/assistant/workflows", {
      ...start,
      audio: "audio-bytes-must-not-be-audited",
    });
    await toolStarted;
    release();

    const residentEvents = events(await response.text());
    expect(residentEvents).toEqual([
      { type: "started", workflowId: "workflow-1", sequence: 0 },
      expect.objectContaining({ type: "answer", workflowId: "workflow-1" }),
    ]);
    expect(auditEvents.some((event) => event.event === "tool.dispatched")).toBe(true);
    expect(JSON.stringify(residentEvents)).not.toContain("tool.dispatched");
    expect(JSON.stringify(auditEvents)).not.toContain("audio-bytes-must-not-be-audited");
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "user.message", text: "Hoe warm is het in de slaapkamer?" }),
    ]));
    expect(memory.recordUserTurn).not.toHaveBeenCalled();
    expect(memory.recordAssistantTurn).not.toHaveBeenCalled();
    expect(memory.retrieve).not.toHaveBeenCalled();
    expect(memory.recall).not.toHaveBeenCalled();
  });
});

describe("companion harness configuration", () => {
  it("keeps developer audit disabled by default and rejects it in production", async () => {
    expect(await createCompanionHarnessFromEnv({ LLM_PROVIDER: "mock" })).toBeUndefined();
    await expect(createCompanionHarnessFromEnv({
      COMPANION_HARNESS: "pi", COMPANION_AUDIT: "true", NODE_ENV: "production", LLM_PROVIDER: "mock",
    })).rejects.toThrow(/audit.*production/i);
    await expect(createCompanionHarnessFromEnv({
      COMPANION_HARNESS: "pi", COMPANION_AUDIT: "perhaps", LLM_PROVIDER: "mock",
    })).rejects.toThrow(/COMPANION_AUDIT/);
  });

  it("writes local audit files only when explicitly enabled without changing SSE", async () => {
    const directory = resolve(import.meta.dirname, "../../../../../logs");
    const existing = new Set(await readdir(directory).catch(() => []));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const companion = (await createCompanionHarnessFromEnv({
        COMPANION_HARNESS: "pi",
        COMPANION_AUDIT: "true",
        NODE_ENV: "development",
        LLM_PROVIDER: "mock",
      }))!;
      const response = await post(createAssistantApp({ workflows: companion }), "/api/assistant/workflows", start);
      expect(events(await response.text())).toEqual([
        { type: "started", workflowId: "workflow-1", sequence: 0 },
        { type: "answer", workflowId: "workflow-1", sequence: 1, inputId: "input-1", text: "Dit is een testantwoord." },
      ]);
      let files: string[] = [];
      await vi.waitFor(async () => {
        files = (await readdir(directory)).filter((file) => file.startsWith("companion-audit-") && !existing.has(file));
        expect(files).toHaveLength(2);
      });
      expect(files.some((file) => file.endsWith(".jsonl"))).toBe(true);
      expect(files.some((file) => file.endsWith(".txt"))).toBe(true);
      await vi.waitFor(async () => {
        const jsonl = await readFile(resolve(directory, files.find((file) => file.endsWith(".jsonl"))!), "utf8");
        expect(jsonl).toContain('"event":"workflow.terminal"');
        expect(jsonl).toContain('"outcome":"answer"');
      });
    } finally {
      warn.mockRestore();
      const files = (await readdir(directory).catch(() => []))
        .filter((file) => file.startsWith("companion-audit-") && !existing.has(file));
      await Promise.all(files.map((file) => rm(resolve(directory, file), { force: true })));
    }
  });

  it("rejects invalid selection and graph settings when disabled", async () => {
    await expect(createCompanionHarnessFromEnv({ COMPANION_HARNESS: "typo" })).rejects.toThrow("COMPANION_HARNESS");
    await expect(createCompanionHarnessFromEnv({ COMPANION_HARNESS: "off", HOME_GRAPH_URL: "bolt://graph:7687" }))
      .rejects.toThrow("requires COMPANION_HARNESS=pi");
    expect(await createCompanionHarnessFromEnv({ COMPANION_HARNESS: "off" })).toBeUndefined();
  });

  it("fails startup for a missing configured readings file", async () => {
    await expect(createCompanionHarnessFromEnv({
      COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock",
      HOME_GRAPH_URL: "bolt://graph:7687", HOME_GRAPH_PASSWORD: "test",
      HOME_DATA_SQLITE_FILE: "/nonexistent/sodalis-readings.sqlite",
    })).rejects.toThrow("ENOENT");
  });

  it("rejects graph URLs with embedded credentials or other schemes", async () => {
    await expect(createCompanionHarnessFromEnv({
      COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock", HOME_GRAPH_URL: "http://localhost:7474", HOME_GRAPH_PASSWORD: "x",
    })).rejects.toThrow(/bolt/);
    await expect(createCompanionHarnessFromEnv({
      COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock", HOME_GRAPH_URL: "bolt://neo4j:secret@localhost:7687", HOME_GRAPH_PASSWORD: "x",
    })).rejects.toThrow(/without credentials/);
    await expect(createCompanionHarnessFromEnv({
      COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock", HOME_GRAPH_URL: "bolt://localhost:7687",
    })).rejects.toThrow(/HOME_GRAPH_PASSWORD/);
  });

  it("keeps the existing LLM provider validation", async () => {
    await expect(createCompanionHarnessFromEnv({ COMPANION_HARNESS: "pi", LLM_PROVIDER: "openai-compatible" }))
      .rejects.toThrow(/LLM_BASE_URL/);
    await expect(createCompanionHarnessFromEnv({ COMPANION_HARNESS: "pi", LLM_PROVIDER: "azure", AZURE_LLM_URL: "https://example.com" }))
      .rejects.toThrow(/Azure/);
  });

  it("escapes secrets so Pi never expands them as commands or variables", () => {
    expect(literalConfigValue("plain-key")).toBe("plain-key");
    expect(literalConfigValue("a$HOME")).toBe("a$$HOME");
    expect(literalConfigValue("!rm -rf /")).toBe("$!rm -rf /");
  });

  it.each([
    [start.messages[0]!.content, ["find_entities", "inspect_neighborhood", "read_external_data"]],
    ["Read all my mail", ["email_scope_limit"]],
    ["Summarize my latest mail", ["email_scope_limit"]],
    ["Do I have any new mail?", ["email_scope_limit"]],
    ["Please mail the package to my home", ["find_entities", "inspect_neighborhood", "read_external_data"]],
    ["Read a book about mail delivery", ["find_entities", "inspect_neighborhood", "read_external_data"]],
  ])("sends the configured key literally and exposes only the permitted tools for %s", async (question, expectedTools) => {
    const { createServer } = await import("node:http");
    const requests: { authorization?: string; body: string }[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        requests.push({ ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}), body });
        response.writeHead(200, { "content-type": "text/event-stream" });
        const chunk = (delta: object, finish: string | null) =>
          `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
        response.end(`${chunk({ role: "assistant", content: "Hallo." }, null)}${chunk({}, "stop")}data: [DONE]\n\n`);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      const companion = (await createCompanionHarnessFromEnv({
        COMPANION_HARNESS: "pi",
        LLM_PROVIDER: "openai-compatible",
        LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
        LLM_MODEL: "local-model",
        LLM_API_KEY: "!echo key$HOME",
      }))!;
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const response = await post(createAssistantApp({ workflows: companion }), "/api/assistant/workflows", {
        ...start,
        messages: [{ role: "user", content: question }],
      });
      expect(events(await response.text()).at(-1)).toMatchObject({ type: "answer", text: "Hallo." });
      expect(requests[0]!.authorization).toBe("Bearer !echo key$HOME");
      const body = JSON.parse(requests[0]!.body) as { model: string; messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[] };
      expect(body.model).toBe("local-model");
      expect(body.messages[0]).toMatchObject({ role: "system" });
      expect(String(body.messages[0]!.content)).toContain("You are Sodalis, a companion");
      expect(body.tools?.map((tool) => tool.function.name)).toEqual(expectedTools);
    } finally {
      server.close();
    }
  });
});
