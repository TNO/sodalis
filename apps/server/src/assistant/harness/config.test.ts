import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSession } = vi.hoisted(() => ({ createSession: vi.fn() }));
vi.mock("./companionSession.js", () => ({ createCompanionSession: createSession }));

import { createCompanionHarnessFromEnv } from "./config.js";
import { fakeHomeSimulator, SIMULATION_TIME } from "./homeSimulator.test-support.js";

describe("configured tools in companion workflows", () => {
  beforeEach(() => {
    createSession.mockReset();
    createSession.mockResolvedValue({
      subscribe: vi.fn(() => vi.fn()),
      prompt: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
      dispose: vi.fn(),
      clearQueue: vi.fn(),
    });
  });

  it("makes every generic email operation available for alternate questions without classification", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const workflows = await createCompanionHarnessFromEnv({
        COMPANION_HARNESS: "pi",
        EMAIL_PROVIDER: "mock",
        LLM_PROVIDER: "mock",
      });
      expect(workflows).toBeDefined();
      const questions = [
        "Find unread messages from Ana.",
        "How many unread messages are in all mail?",
        "What does the latest library email say?",
      ];

      for (const [index, question] of questions.entries()) {
        const workflowId = `email-workflow-${index}`;
        const result = workflows!.start({
          sessionId: `email-session-${index}`,
          workflowId,
          inputId: `email-input-${index}`,
          messages: [{ role: "user", content: question }],
        }, { onEvent: vi.fn() });
        expect(result.status).toBe("started");
        await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(index + 1));
        const options = createSession.mock.calls[index]![0] as {
          readonly tools: readonly { readonly name: string }[];
        };
        expect(options.tools.map(({ name }) => name)).toEqual(expect.arrayContaining([
          "list_messages",
          "get_message_content",
          "count_unread",
        ]));
        workflows!.cancel(workflowId);
      }
    } finally {
      warn.mockRestore();
    }
  });

  it("replaces graph/SQLite tools with five Home Simulator tools and reads a new clock for every workflow", async () => {
    const bridge = await fakeHomeSimulator();
    try {
      const workflows = await createCompanionHarnessFromEnv({
        COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock", HOME_SIMULATOR_BRIDGE_URL: bridge.url,
        HOME_GRAPH_URL: "not a graph url", HOME_GRAPH_PASSWORD: "", HOME_DATA_SQLITE_FILE: "/does/not/exist.sqlite",
      });
      for (const [index, time] of [SIMULATION_TIME, "2025-02-16T18:30:00Z"].entries()) {
        bridge.replies.set("/clock", { body: { simulationTime: time } });
        workflows!.start({
          sessionId: `simulated-session-${index}`, workflowId: `simulated-workflow-${index}`, inputId: "input",
          messages: [{ role: "user", content: "What happened recently?" }],
        }, { onEvent: vi.fn() });
        await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(index + 1));
        const options = createSession.mock.calls[index]![0] as {
          tools: { name: string }[]; appendSystemPrompt: string[];
        };
        expect(options.tools.map(({ name }) => name)).toEqual([
          "query_sensor_data", "get_context", "query_ontology", "query_weather", "get_agenda",
        ]);
        expect(options.appendSystemPrompt.join(" ")).toContain(time);
        workflows!.cancel(`simulated-workflow-${index}`);
      }
      expect(bridge.requests.map(({ path }) => path)).toEqual(["/clock", "/clock"]);
    } finally { await bridge.close(); }
  });

  it("keeps email separately opt-in and does not initialize Home Simulator with the harness off", async () => {
    const bridge = await fakeHomeSimulator();
    try {
      expect(await createCompanionHarnessFromEnv({ COMPANION_HARNESS: "off", HOME_SIMULATOR_BRIDGE_URL: bridge.url })).toBeUndefined();
      expect(bridge.requests).toEqual([]);
      const workflows = await createCompanionHarnessFromEnv({
        COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock", EMAIL_PROVIDER: "mock", HOME_SIMULATOR_BRIDGE_URL: bridge.url,
      });
      workflows!.start({ sessionId: "s", workflowId: "w", inputId: "i", messages: [{ role: "user", content: "My mail?" }] }, { onEvent: vi.fn() });
      await vi.waitFor(() => expect(createSession).toHaveBeenCalledOnce());
      expect(createSession.mock.calls[0]![0].tools.map(({ name }: { name: string }) => name)).toEqual([
        "query_sensor_data", "get_context", "query_ontology", "query_weather", "get_agenda",
        "list_messages", "get_message_content", "count_unread",
      ]);
      workflows!.cancel("w");
    } finally { await bridge.close(); }
  });

  it.each(["not a URL", "file:///etc", "https://bridge.test/tools/get_session", "http://user:secret@bridge.test", "http://bridge.test/?tool=advance"])("rejects a bridge setting that is not a fixed HTTP origin: %s", async (url) => {
    await expect(createCompanionHarnessFromEnv({ COMPANION_HARNESS: "pi", LLM_PROVIDER: "mock", HOME_SIMULATOR_BRIDGE_URL: url }))
      .rejects.toThrow(/HOME_SIMULATOR_BRIDGE_URL/);
  });
});
