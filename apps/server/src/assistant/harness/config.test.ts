import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSession } = vi.hoisted(() => ({ createSession: vi.fn() }));
vi.mock("./companionSession.js", () => ({ createCompanionSession: createSession }));

import { createCompanionHarnessFromEnv } from "./config.js";

describe("mock email tools in companion workflows", () => {
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
});
