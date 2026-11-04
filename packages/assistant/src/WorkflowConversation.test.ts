import { describe, expect, it, vi } from "vitest";
import type { ConversationAudioOutput, ConversationMessage } from "./index.js";
import type {
  CompanionSteerResult,
  CompanionWorkflowClient,
  CompanionWorkflowEvent,
  CompanionWorkflowStartRequest,
} from "./ServerWorkflowClient.js";
import { WorkflowConversationOrchestrator } from "./WorkflowConversation.js";

/** A workflow stream whose events the test pushes. */
class FakeWorkflow {
  readonly events: CompanionWorkflowEvent[] = [];
  private wake: (() => void) | undefined;
  private sequence = 0;
  ended = false;

  constructor(readonly request: CompanionWorkflowStartRequest) {
    this.push({ type: "started", workflowId: request.workflowId, sequence: 0 });
  }

  answer(text: string, inputId = this.request.inputId) {
    this.push({ type: "answer", workflowId: this.request.workflowId, sequence: ++this.sequence, inputId, text });
  }

  cancelled() {
    this.push({ type: "cancelled", workflowId: this.request.workflowId, sequence: ++this.sequence });
  }

  private push(event: CompanionWorkflowEvent) {
    this.events.push(event);
    this.wake?.();
  }

  async *stream(): AsyncIterable<CompanionWorkflowEvent> {
    let index = 0;
    while (true) {
      while (index < this.events.length) {
        const event = this.events[index++]!;
        yield event;
        if (event.type !== "started") return;
      }
      if (this.request.signal.aborted) throw this.request.signal.reason;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        this.request.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    }
  }
}

function setup(steerResults: CompanionSteerResult[] = []) {
  const workflows: FakeWorkflow[] = [];
  const steer = vi.fn(async (_request: { workflowId: string; inputId: string; text: string }) => steerResults.shift() ?? "accepted");
  const client: CompanionWorkflowClient = {
    start: (request) => {
      const workflow = new FakeWorkflow(request);
      workflows.push(workflow);
      return workflow.stream();
    },
    steer,
    cancel: vi.fn(async () => {}),
  };
  const spoken: string[] = [];
  const audioOutput: ConversationAudioOutput = {
    speak: vi.fn(async (request) => {
      spoken.push(request.text);
    }),
    stopPlayback: vi.fn(),
    cancelTts: vi.fn(),
  };
  let id = 0;
  const conversation = new WorkflowConversationOrchestrator({
    client,
    audioOutput,
    createSessionId: () => "session-1",
    createId: (prefix) => `${prefix}-${++id}`,
  });
  return { conversation, client, steer, workflows, spoken, audioOutput };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function contents(messages: readonly ConversationMessage[]) {
  return messages.map((message) => `${message.role}:${message.content}`);
}

describe("workflow conversation", () => {
  it("starts a workflow, speaks the answer and carries history into the next workflow", async () => {
    const { conversation, workflows, spoken } = setup();
    await conversation.submitUserMessage("Hoe warm is het?");
    expect(conversation.state.state).toBe("thinking");
    workflows[0]!.answer("Het is 19 graden.");
    await vi.waitFor(() => expect(spoken).toEqual(["Het is 19 graden."]));
    await vi.waitFor(() => expect(conversation.state.state).toBe("idle"));

    await conversation.submitUserMessage("En buiten?");
    expect(contents(workflows[1]!.request.messages)).toEqual([
      "user:Hoe warm is het?",
      "assistant:Het is 19 graden.",
      "user:En buiten?",
    ]);
  });

  it("steers a running workflow instead of starting another", async () => {
    const { conversation, workflows, steer, spoken } = setup(["accepted"]);
    await conversation.submitUserMessage("Hoe warm is het in de slaapkamer?");
    await conversation.submitUserMessage("En in de keuken?");
    expect(workflows).toHaveLength(1);
    expect(steer).toHaveBeenCalledWith({ workflowId: workflows[0]!.request.workflowId, inputId: expect.any(String), text: "En in de keuken?" });
    workflows[0]!.answer("Slaapkamer 19, keuken 21 graden.", steer.mock.calls[0]![0].inputId);
    await vi.waitFor(() => expect(spoken).toEqual(["Slaapkamer 19, keuken 21 graden."]));
  });

  it("treats a duplicate steering acknowledgement as accepted", async () => {
    const { conversation, workflows } = setup(["duplicate"]);
    await conversation.submitUserMessage("Eerste vraag");
    await conversation.submitUserMessage("Tweede vraag");
    expect(workflows).toHaveLength(1);
  });

  it("starts exactly one new workflow when steering loses the race with settlement", async () => {
    let releaseSteer!: (result: CompanionSteerResult) => void;
    const { conversation, workflows, steer, spoken } = setup();
    steer.mockImplementationOnce(() => new Promise((resolve) => {
      releaseSteer = resolve;
    }));
    await conversation.submitUserMessage("Hoe warm is het?");
    const submitting = conversation.submitUserMessage("Nee, ik bedoel de keuken.");
    await flush();
    // The old answer is in transit while the newer message is being submitted.
    workflows[0]!.answer("Het is 19 graden.");
    await flush();
    releaseSteer("not_running");
    await submitting;

    expect(spoken).toEqual([]);
    expect(workflows).toHaveLength(2);
    expect(contents(workflows[1]!.request.messages)).toEqual([
      "user:Hoe warm is het?",
      "assistant:Het is 19 graden.",
      "user:Nee, ik bedoel de keuken.",
    ]);
    workflows[1]!.answer("De keuken is 21 graden.");
    await vi.waitFor(() => expect(spoken).toEqual(["De keuken is 21 graden."]));
  });

  it("speaks an answer that covers steering acknowledged after the answer arrived", async () => {
    let releaseSteer!: (result: CompanionSteerResult) => void;
    const { conversation, workflows, steer, spoken } = setup();
    steer.mockImplementationOnce(() => new Promise((resolve) => {
      releaseSteer = resolve;
    }));
    await conversation.submitUserMessage("Hoe warm is het?");
    const submitting = conversation.submitUserMessage("En in de keuken?");
    await flush();
    workflows[0]!.answer("Slaapkamer 19, keuken 21.", steer.mock.calls[0]![0].inputId);
    await flush();
    releaseSteer("accepted");
    await submitting;
    await vi.waitFor(() => expect(spoken).toEqual(["Slaapkamer 19, keuken 21."]));
    expect(workflows).toHaveLength(1);
  });

  it("stops speech on speech onset without cancelling, and holds an answer until the utterance resolves", async () => {
    const { conversation, client, workflows, spoken, audioOutput } = setup();
    await conversation.submitUserMessage("Hoe warm is het?");
    conversation.setInterrupted();
    conversation.setTranscribing();
    expect(audioOutput.stopPlayback).toHaveBeenCalled();
    expect(audioOutput.cancelTts).toHaveBeenCalled();
    expect(client.cancel).not.toHaveBeenCalled();

    workflows[0]!.answer("Het is 19 graden.");
    await flush();
    expect(spoken).toEqual([]);
    conversation.discardUtterance();
    await vi.waitFor(() => expect(spoken).toEqual(["Het is 19 graden."]));
  });

  it("cancels only on explicit cancel and ignores late output", async () => {
    const { conversation, client, workflows, spoken } = setup();
    await conversation.submitUserMessage("Hoe warm is het?");
    conversation.cancelTurn();
    expect(client.cancel).toHaveBeenCalledWith(workflows[0]!.request.workflowId);
    expect(workflows[0]!.request.signal.aborted).toBe(true);
    expect(conversation.state.state).toBe("interrupted");
    workflows[0]!.answer("Te laat.");
    await flush();
    expect(spoken).toEqual([]);

    await conversation.submitUserMessage("Nieuwe vraag");
    expect(workflows).toHaveLength(2);
  });

  it("does not offer app actions", async () => {
    const { conversation } = setup();
    await expect(conversation.confirmPendingAction()).rejects.toThrow(/not available/);
    expect(() => conversation.cancelPendingAction()).toThrow(/not available/);
  });
});
