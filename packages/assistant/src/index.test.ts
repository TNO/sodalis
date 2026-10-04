import { describe, expect, it, vi } from "vitest";
import type {
  ConversationAudioOutput,
  ConversationMessage,
  LlmProvider,
  LlmStreamRequest,
  LlmTextDelta,
} from "./index.js";
import { ConversationOrchestrator } from "./index.js";

function createProvider(
  stream: (request: LlmStreamRequest) => AsyncIterable<LlmTextDelta>,
): LlmProvider {
  return { id: "test-llm", stream };
}

function createAudioOutput(
  speak: ConversationAudioOutput["speak"] = async () => undefined,
): ConversationAudioOutput & {
  speak: ReturnType<typeof vi.fn<ConversationAudioOutput["speak"]>>;
  stopPlayback: ReturnType<typeof vi.fn<() => void>>;
  cancelTts: ReturnType<typeof vi.fn<() => void>>;
} {
  return {
    speak: vi.fn(speak),
    stopPlayback: vi.fn(),
    cancelTts: vi.fn(),
  };
}

describe("ConversationOrchestrator", () => {
  it("streams a turn with trusted app context and speaks the final caption", async () => {
    const requests: LlmStreamRequest[] = [];
    let finishSpeech: (() => void) | undefined;
    const speechDone = new Promise<void>((resolve) => {
      finishSpeech = resolve;
    });
    const audioOutput = createAudioOutput(async (_request, signal) => {
      await speechDone;
      signal.throwIfAborted();
    });
    const states: string[] = [];
    const orchestrator = new ConversationOrchestrator({
      provider: createProvider(async function* (request) {
        requests.push(request);
        yield {
          sessionId: request.sessionId,
          turnId: request.turnId,
          sequence: 0,
          text: "De ",
        };
        yield {
          sessionId: request.sessionId,
          turnId: request.turnId,
          sequence: 1,
          text: "mail staat open.",
        };
      }),
      audioOutput,
      getAppContext: () => ({
        appId: "mail",
        appName: "Mail",
        category: "Productivity",
      }),
      createSessionId: () => "session-1",
      createTurnId: () => "turn-1",
      onChange(snapshot) {
        states.push(snapshot.state);
      },
    });

    const turn = orchestrator.submitUserMessage("Waar is mijn mail?");
    await vi.waitFor(() => expect(audioOutput.speak).toHaveBeenCalledOnce());
    const speechRequest = audioOutput.speak.mock.calls[0]?.[0];
    expect(requests[0]?.appContext).toEqual({
      appId: "mail",
      appName: "Mail",
      category: "Productivity",
    });
    expect(requests[0]?.messages).toEqual([
      { role: "user", content: "Waar is mijn mail?" },
    ]);
    expect(orchestrator.state).toMatchObject({
      state: "thinking",
      userTranscript: "Waar is mijn mail?",
      assistantText: "De mail staat open.",
    });
    expect(speechRequest).toMatchObject({
      sessionId: "session-1",
      speechId: "turn-1",
      text: "De mail staat open.",
      language: "nl-NL",
    });

    orchestrator.notifyPlaybackState("turn-1", true);
    expect(orchestrator.state.state).toBe("speaking");
    orchestrator.notifyPlaybackState("turn-1", false);
    expect(orchestrator.state.state).toBe("thinking");
    finishSpeech?.();
    await turn;
    expect(orchestrator.state.state).toBe("idle");
    expect(states).toContain("thinking");
    expect(states).toContain("speaking");
  });

  it("cancels a turn and ignores late LLM chunks", async () => {
    let releaseResponse: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const audioOutput = createAudioOutput();
    const orchestrator = new ConversationOrchestrator({
      provider: createProvider(async function* (request) {
        await responseReady;
        yield {
          sessionId: request.sessionId,
          turnId: request.turnId,
          sequence: 0,
          text: "This must not appear.",
        };
      }),
      audioOutput,
      createSessionId: () => "session-1",
      createTurnId: () => "turn-1",
    });

    const turn = orchestrator.submitUserMessage("Help me.");
    await vi.waitFor(() => expect(orchestrator.state.state).toBe("thinking"));
    orchestrator.cancelTurn();
    expect(orchestrator.state.state).toBe("interrupted");
    releaseResponse?.();
    await turn;

    expect(orchestrator.state.assistantText).toBe("");
    expect(audioOutput.speak).not.toHaveBeenCalled();
    expect(audioOutput.stopPlayback).toHaveBeenCalledOnce();
    expect(audioOutput.cancelTts).toHaveBeenCalledOnce();
  });

  it("bounds working history and reports provider failures", async () => {
    const requests: ConversationMessage[][] = [];
    let turnId = 0;
    const orchestrator = new ConversationOrchestrator({
      provider: createProvider(async function* (request) {
        requests.push([...request.messages]);
        yield {
          sessionId: request.sessionId,
          turnId: request.turnId,
          sequence: 0,
          text: `Reply ${++turnId}`,
        };
      }),
      audioOutput: createAudioOutput(),
      createSessionId: () => "session-1",
      createTurnId: () => `turn-${turnId + 1}`,
      historyMessageLimit: 2,
    });
    await orchestrator.submitUserMessage("First");
    await orchestrator.submitUserMessage("Second");

    expect(requests[1]).toEqual([
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply 1" },
      { role: "user", content: "Second" },
    ]);

    const broken = new ConversationOrchestrator({
      provider: createProvider(async function* () {
        throw new Error("LLM is offline.");
      }),
      audioOutput: createAudioOutput(),
      createSessionId: () => "failure-session",
      createTurnId: () => "failure-turn",
    });
    await broken.submitUserMessage("Hello");
    expect(broken.state).toMatchObject({
      state: "error",
      error: "LLM is offline.",
    });
  });

  it("preserves playback failures and keeps microphone errors separate", async () => {
    let orchestrator: ConversationOrchestrator;
    const audioOutput = createAudioOutput(async (request) => {
      orchestrator.notifyPlaybackState(request.speechId, true);
      orchestrator.notifyPlaybackState(request.speechId, false);
      throw new Error("Audio stream failed.");
    });
    orchestrator = new ConversationOrchestrator({
      provider: createProvider(async function* (request) {
        yield {
          sessionId: request.sessionId,
          turnId: request.turnId,
          sequence: 0,
          text: "Answer.",
        };
      }),
      audioOutput,
      createSessionId: () => "session-1",
      createTurnId: () => "turn-1",
    });

    await orchestrator.submitUserMessage("Question");

    expect(orchestrator.state).toMatchObject({
      state: "error",
      error: "Audio stream failed.",
    });
  });

  it("does not let microphone errors cancel a typed turn", async () => {
    let releaseResponse!: () => void;
    let markStarted!: () => void;
    const responseReady = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const audioOutput = createAudioOutput();
    const orchestrator = new ConversationOrchestrator({
      provider: createProvider(async function* (request) {
        markStarted();
        await responseReady;
        yield {
          sessionId: request.sessionId,
          turnId: request.turnId,
          sequence: 0,
          text: "Typed response.",
        };
      }),
      audioOutput,
      createSessionId: () => "session-1",
      createTurnId: () => "turn-1",
    });

    const turn = orchestrator.submitUserMessage("Typed question");
    await started;
    orchestrator.reportInputError(new Error("Microphone unavailable."));
    expect(orchestrator.state.state).toBe("thinking");
    releaseResponse();
    await turn;

    expect(audioOutput.speak).toHaveBeenCalledOnce();
    expect(audioOutput.stopPlayback).not.toHaveBeenCalled();
    expect(audioOutput.cancelTts).not.toHaveBeenCalled();
  });

  it("rejects history limits that can exceed the API message budget", () => {
    expect(
      () =>
        new ConversationOrchestrator({
          provider: createProvider(async function* () {}),
          audioOutput: createAudioOutput(),
          historyMessageLimit: 13,
        }),
    ).toThrow("Conversation history limit must be between two and 12.");
  });
});
