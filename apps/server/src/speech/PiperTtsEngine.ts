import { spawn } from "node:child_process";
import type { SpeechRequest } from "@sodalis/speech";

export const PIPER_VOICE_ID = "nl_BE-nathalie-medium";
export const PIPER_PCM_MIME_TYPE =
  "audio/pcm;rate=22050;bits=16;channels=1;endianness=little";

export interface SpeechSynthesisEngine {
  synthesize(
    request: SpeechRequest,
    signal: AbortSignal,
  ): AsyncIterable<Uint8Array>;
}

export interface PiperProcess {
  readonly stdin: { end(text: string): void };
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: string;
  readonly inputError?: unknown;
  waitForExit(): Promise<number | null>;
  terminate(): void;
}

export interface PiperTtsEngineOptions {
  readonly executable?: string;
  readonly modelPath: string;
  readonly createProcess?: (
    executable: string,
    args: readonly string[],
  ) => PiperProcess;
}

function createPiperProcess(
  executable: string,
  args: readonly string[],
): PiperProcess {
  const child = spawn(executable, [...args], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error("Piper process streams could not be created.");
  }

  let stderr = "";
  let inputError: unknown;
  child.stdin.on("error", (error: Error) => {
    inputError = error;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4096);
  });

  const exit = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });

  return {
    stdin: {
      end(text) {
        child.stdin?.end(text);
      },
    },
    stdout: child.stdout,
    get stderr() {
      return stderr.trim();
    },
    get inputError() {
      return inputError;
    },
    waitForExit: () => exit,
    terminate() {
      if (!child.killed) child.kill("SIGTERM");
    },
  };
}

function normalizeAbortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ??
    new DOMException("Speech synthesis was cancelled.", "AbortError")
  );
}

export class PiperTtsEngine implements SpeechSynthesisEngine {
  private readonly executable: string;
  private readonly modelPath: string;
  private readonly createProcess: NonNullable<
    PiperTtsEngineOptions["createProcess"]
  >;

  constructor(options: PiperTtsEngineOptions) {
    if (!options.modelPath.trim()) {
      throw new Error("A Piper voice model path is required.");
    }
    this.executable = options.executable ?? "piper";
    this.modelPath = options.modelPath;
    this.createProcess = options.createProcess ?? createPiperProcess;
  }

  async *synthesize(
    request: SpeechRequest,
    signal: AbortSignal,
  ): AsyncIterable<Uint8Array> {
    signal.throwIfAborted();
    if (!request.text.trim()) {
      throw new Error("Speech text must not be empty.");
    }
    if (!["nl-NL", "nl-BE"].includes(request.language)) {
      throw new Error(`Piper does not support "${request.language}".`);
    }
    if (request.voice && request.voice !== PIPER_VOICE_ID) {
      throw new Error(`Piper voice "${request.voice}" is not configured.`);
    }

    const process = this.createProcess(this.executable, [
      "--model",
      this.modelPath,
      "--output-raw",
    ]);
    let exited = false;
    let processFailure: unknown;
    const exit = process.waitForExit().then(
      (code) => {
        exited = true;
        return { code };
      },
      (error: unknown) => {
        exited = true;
        processFailure = error;
        return { error };
      },
    );
    const terminate = () => process.terminate();
    signal.addEventListener("abort", terminate, { once: true });

    try {
      process.stdin.end(`${request.text}\n`);
      for await (const chunk of process.stdout) {
        signal.throwIfAborted();
        if (chunk.byteLength) yield chunk;
      }

      const result = await exit;
      signal.throwIfAborted();
      if ("error" in result) throw result.error;
      if (process.inputError) throw process.inputError;
      if (result.code !== 0) {
        const detail = process.stderr ? `: ${process.stderr}` : ".";
        throw new Error(`Piper exited with code ${result.code}${detail}`);
      }
    } catch (error) {
      if (signal.aborted) throw normalizeAbortReason(signal);
      throw processFailure ?? error;
    } finally {
      signal.removeEventListener("abort", terminate);
      if (!exited) process.terminate();
    }
  }
}
