import { describe, expect, it, vi } from "vitest";
import {
  createAssistantActionRuntime,
  type AppActionDefinition,
} from "./AssistantActions.js";

function createSendAction(
  execute: AppActionDefinition["execute"],
): AppActionDefinition {
  return {
    id: "mail.send",
    description: "Send a message from the mock Mail app.",
    risk: "external-effect",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", maxLength: 200 },
        subject: { type: "string", maxLength: 300 },
      },
      required: ["to", "subject"],
      additionalProperties: false,
    },
    confirmationPhrase: "confirm send",
    confirmationSummary: ({ to, subject }) =>
      `Send "${String(subject)}" to ${String(to)}?`,
    execute,
  };
}

describe("AssistantActionRuntime", () => {
  it("requires application confirmation for external effects even if metadata opts out", async () => {
    const execute = vi.fn(async () => "Message sent.");
    const runtime = createAssistantActionRuntime([createSendAction(execute)]);
    const result = await runtime.invoke({
      id: "mail.send",
      arguments: { to: "anne@example.test", subject: "Project update" },
    });

    expect(result.status).toBe("confirmation-required");
    if (result.status !== "confirmation-required") {
      throw new Error("Expected a pending confirmation.");
    }
    expect(result.pending.summary).toBe(
      'Send "Project update" to anne@example.test?',
    );
    expect(runtime.getAvailableActions()[0]?.requiresConfirmation).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes the exact pending arguments only through its confirmation ID", async () => {
    const execute = vi.fn(async () => "Message sent.");
    const runtime = createAssistantActionRuntime([createSendAction(execute)]);
    const pending = await runtime.invoke({
      id: "mail.send",
      arguments: { to: "anne@example.test", subject: "Project update" },
    });
    if (pending.status !== "confirmation-required") {
      throw new Error("Expected a pending confirmation.");
    }

    await expect(runtime.confirm("stale-confirmation")).rejects.toThrow(
      "No matching action confirmation is pending.",
    );
    await expect(
      runtime.confirm(pending.pending.id),
    ).resolves.toEqual({ status: "completed", message: "Message sent." });
    expect(execute).toHaveBeenCalledWith({
      to: "anne@example.test",
      subject: "Project update",
    });
    await expect(runtime.confirm(pending.pending.id)).rejects.toThrow(
      "No matching action confirmation is pending.",
    );
  });

  it("does not treat an unrelated yes as consent to an old action", async () => {
    const execute = vi.fn(async () => "Message sent.");
    const runtime = createAssistantActionRuntime([createSendAction(execute)]);
    const pending = await runtime.invoke({
      id: "mail.send",
      arguments: { to: "anne@example.test", subject: "Project update" },
    });
    if (pending.status !== "confirmation-required") {
      throw new Error("Expected a pending confirmation.");
    }

    await expect(runtime.respondToConfirmation("yes")).resolves.toBeUndefined();
    expect(runtime.getPendingConfirmation()).toBeUndefined();
    await expect(runtime.confirm(pending.pending.id)).rejects.toThrow(
      "No matching action confirmation is pending.",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects reused confirmation IDs that could refer to a different action", async () => {
    const runtime = createAssistantActionRuntime(
      [createSendAction(async () => "Message sent.")],
      { createConfirmationId: () => "fixed-confirmation" },
    );
    const first = await runtime.invoke({
      id: "mail.send",
      arguments: { to: "anne@example.test", subject: "First" },
    });
    if (first.status !== "confirmation-required") {
      throw new Error("Expected a pending confirmation.");
    }
    runtime.cancel(first.pending.id);

    await expect(
      runtime.invoke({
        id: "mail.send",
        arguments: { to: "bob@example.test", subject: "Different message" },
      }),
    ).rejects.toThrow("A unique valid action confirmation ID is required.");
  });

  it("accepts an explicit conversational phrase only for the current pending action", async () => {
    const execute = vi.fn(async () => "Message sent.");
    const runtime = createAssistantActionRuntime([createSendAction(execute)]);
    await runtime.invoke({
      id: "mail.send",
      arguments: { to: "anne@example.test", subject: "Project update" },
    });

    await expect(runtime.respondToConfirmation("confirm send")).resolves.toEqual(
      { status: "completed", message: "Message sent." },
    );
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects malformed or additional action arguments before execution", async () => {
    const execute = vi.fn(async () => "Message sent.");
    const runtime = createAssistantActionRuntime([createSendAction(execute)]);

    await expect(
      runtime.invoke({
        id: "mail.send",
        arguments: {
          to: "anne@example.test",
          subject: "Project update",
          bypassConfirmation: true,
        },
      }),
    ).rejects.toThrow('Action "mail.send" does not accept "bypassConfirmation".');
    expect(execute).not.toHaveBeenCalled();
  });
});
