import { describe, expect, it, vi } from "vitest";
import type { SpeechRequest } from "@sodalis/speech";
import { PiperTtsEngine } from "./PiperTtsEngine.js";
import type { PiperProcess } from "./PiperTtsEngine.js";

const request: SpeechRequest = {
  sessionId: "turn-1",
  speechId: "reply-1",
  text: "Goedemorgen.",
  language: "nl-NL",
  voice: "nl_BE-nathalie-medium",
};

class FakePiperProcess implements PiperProcess {
  readonly stdin = {
    end: vi.fn<(text: string) => void>(),
  };
  readonly stderr = "Piper diagnostic output.";
  readonly waitForExit: ReturnType<typeof vi.fn<() => Promise<number | null>>>;
  readonly terminate: ReturnType<typeof vi.fn<() => void>>;
  readonly stdout: AsyncIterable<Uint8Array>;
  private resolveExit: (code: number | null) => void = () => undefined;

  constructor(chunks: readonly Uint8Array[], exitCode = 0) {
    const exit = new Promise<number | null>((resolve) => {
      this.resolveExit = resolve;
    });
    this.waitForExit = vi.fn(() => exit);
    this.terminate = vi.fn(() => this.resolveExit(null));
    const finish = (code: number | null) => this.resolveExit(code);
    this.stdout = {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
        finish(exitCode);
      },
    };
  }
}

describe("PiperTtsEngine", () => {
  it("streams raw audio from Piper with the selected female Dutch model", async () => {
    const process = new FakePiperProcess([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ]);
    const createProcess = vi.fn(() => process);
    const engine = new PiperTtsEngine({
      executable: "/tools/piper",
      modelPath: "/voices/nl_BE-nathalie-medium.onnx",
      createProcess,
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of engine.synthesize(
      request,
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    expect(createProcess).toHaveBeenCalledWith("/tools/piper", [
      "--model",
      "/voices/nl_BE-nathalie-medium.onnx",
      "--output-raw",
    ]);
    expect(process.stdin.end).toHaveBeenCalledWith("Goedemorgen.\n");
    expect(chunks).toEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ]);
    expect(process.waitForExit).toHaveBeenCalledOnce();
    expect(process.terminate).not.toHaveBeenCalled();
  });

  it("reports a failed Piper process with its diagnostic output", async () => {
    const process = new FakePiperProcess([], 1);
    const engine = new PiperTtsEngine({
      modelPath: "/voices/nl_BE-nathalie-medium.onnx",
      createProcess: () => process,
    });

    await expect(async () => {
      for await (const _chunk of engine.synthesize(
        request,
        new AbortController().signal,
      )) {
        // Drain the stream to observe the process exit.
      }
    }).rejects.toThrow("Piper exited with code 1: Piper diagnostic output.");
  });

  it("reports an input-pipe failure rather than silently losing the text", async () => {
    const inputFailure = new Error("Piper input pipe closed.");
    const process: PiperProcess = {
      stdin: { end: vi.fn() },
      stdout: {
        async *[Symbol.asyncIterator]() {},
      },
      stderr: "",
      inputError: inputFailure,
      waitForExit: async () => 0,
      terminate: vi.fn(),
    };
    const engine = new PiperTtsEngine({
      modelPath: "/voices/nl_BE-nathalie-medium.onnx",
      createProcess: () => process,
    });

    await expect(async () => {
      for await (const _chunk of engine.synthesize(
        request,
        new AbortController().signal,
      )) {
        // Drain the stream to observe the input failure.
      }
    }).rejects.toBe(inputFailure);
  });

  it("terminates Piper when the consumer stops reading early", async () => {
    const process = new FakePiperProcess([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ]);
    const engine = new PiperTtsEngine({
      modelPath: "/voices/nl_BE-nathalie-medium.onnx",
      createProcess: () => process,
    });
    const iterator = engine
      .synthesize(request, new AbortController().signal)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: new Uint8Array([1, 2]),
    });
    await iterator.return?.();

    expect(process.terminate).toHaveBeenCalledOnce();
  });

  it("rejects an unsupported voice before starting a process", async () => {
    const createProcess = vi.fn(() => new FakePiperProcess([]));
    const engine = new PiperTtsEngine({
      modelPath: "/voices/nl_BE-nathalie-medium.onnx",
      createProcess,
    });

    await expect(async () => {
      for await (const _chunk of engine.synthesize(
        { ...request, voice: "nl_NL-pim-medium" },
        new AbortController().signal,
      )) {
        // A different voice must not reach the configured engine.
      }
    }).rejects.toThrow('Piper voice "nl_NL-pim-medium" is not configured.');
    expect(createProcess).not.toHaveBeenCalled();
  });
});
