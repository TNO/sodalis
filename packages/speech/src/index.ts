export const SPEECH_PROVIDER_SELECTIONS = [
  "browser",
  "server",
  "auto",
] as const;

export type SpeechProviderSelection =
  (typeof SPEECH_PROVIDER_SELECTIONS)[number];

export type SpeechProviderRuntime = Exclude<
  SpeechProviderSelection,
  "auto"
>;

export interface SpeechProviderCapabilities {
  readonly runtime: SpeechProviderRuntime;
}

export interface SpeechProviderDescriptor<
  TCapabilities extends SpeechProviderCapabilities = SpeechProviderCapabilities,
> {
  readonly id: string;
  readonly capabilities: TCapabilities;
}

export type SpeechSessionId = string;

export interface SpeechAudioChunk {
  readonly data: Uint8Array;
  readonly mimeType: string;
}

export interface SpeechToTextCapabilities
  extends SpeechProviderCapabilities {
  readonly languages: readonly string[];
  readonly partialResults: boolean;
  readonly inputAudioMimeTypes: readonly string[];
}

export type SpeechToTextResult =
  | {
      readonly type: "partial";
      readonly text: string;
      readonly confidence?: number;
    }
  | {
      readonly type: "final";
      readonly text: string;
      readonly confidence?: number;
    };

type AddSessionId<T> = T extends unknown
  ? T & { readonly sessionId: SpeechSessionId }
  : never;

export type SpeechToTextEvent = AddSessionId<SpeechToTextResult>;

export interface SpeechToTextSessionConfig {
  readonly sessionId: SpeechSessionId;
  readonly language: string;
  /** Aborting this signal cancels the session and its event stream. */
  readonly signal: AbortSignal;
}

export interface SpeechToTextSession {
  readonly id: SpeechSessionId;
  readonly events: AsyncIterable<SpeechToTextEvent>;
  /** Submit an audio segment; rejects after finish or cancellation. */
  writeAudio(chunk: SpeechAudioChunk): Promise<void>;
  /** Signal end-of-input; the provider may emit final events afterward. */
  finish(): Promise<void>;
}

export interface SpeechToTextProvider
  extends SpeechProviderDescriptor<SpeechToTextCapabilities> {
  createSession(
    config: SpeechToTextSessionConfig,
  ): Promise<SpeechToTextSession>;
}

export interface MockSpeechToTextProviderOptions {
  readonly id?: string;
  readonly capabilities?: SpeechToTextCapabilities;
  readonly events?: readonly SpeechToTextResult[];
}

const MOCK_STT_CAPABILITIES: SpeechToTextCapabilities = {
  runtime: "browser",
  languages: ["en-US", "nl-NL"],
  partialResults: true,
  inputAudioMimeTypes: ["audio/wav"],
};

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  readonly id: string;
  readonly capabilities: SpeechToTextCapabilities;
  private readonly scriptedEvents: readonly SpeechToTextResult[];

  constructor(options: MockSpeechToTextProviderOptions = {}) {
    this.id = options.id ?? "mock-stt";
    this.capabilities = options.capabilities ?? MOCK_STT_CAPABILITIES;
    this.scriptedEvents = options.events ?? [];
  }

  async createSession(
    config: SpeechToTextSessionConfig,
  ): Promise<SpeechToTextSession> {
    config.signal.throwIfAborted();
    let finished = false;
    const scriptedEvents = this.scriptedEvents;
    const events: AsyncIterable<SpeechToTextEvent> = {
      [Symbol.asyncIterator]: async function* () {
        for (const event of scriptedEvents) {
          config.signal.throwIfAborted();
          yield { ...event, sessionId: config.sessionId };
        }
      },
    };

    return {
      id: config.sessionId,
      events,
      writeAudio: async (_chunk) => {
        config.signal.throwIfAborted();
        if (finished) throw new Error("Speech input has already finished.");
      },
      finish: async () => {
        config.signal.throwIfAborted();
        finished = true;
      },
    };
  }
}

export type SpeechId = string;

export interface TextToSpeechCapabilities extends SpeechProviderCapabilities {
  readonly languages: readonly string[];
  readonly streamingAudio: boolean;
  readonly phonemeTiming: boolean;
  readonly visemeTiming: boolean;
  readonly wordTiming: boolean;
  readonly emotionStyleControl: boolean;
}

export interface SpeechRequest {
  readonly sessionId: SpeechSessionId;
  readonly speechId: SpeechId;
  readonly text: string;
  readonly language: string;
  readonly voice?: string;
  readonly style?: string;
}

export type SpeechOutputPayload =
  | {
      readonly type: "audio";
      readonly data: Uint8Array;
      readonly mimeType: string;
    }
  | {
      readonly type: "timing";
      readonly kind: "phoneme" | "viseme" | "word";
      readonly value: string;
      readonly startMs: number;
      readonly endMs: number;
    };

type AddSpeechMetadata<T> = T extends unknown
  ? T & {
      readonly sessionId: SpeechSessionId;
      readonly speechId: SpeechId;
      readonly sequence: number;
    }
  : never;

export type SpeechOutputChunk = AddSpeechMetadata<SpeechOutputPayload>;

export interface TextToSpeechProvider
  extends SpeechProviderDescriptor<TextToSpeechCapabilities> {
  /** Aborting the signal rejects further iteration with its abort reason. */
  speak(
    request: SpeechRequest,
    signal: AbortSignal,
  ): AsyncIterable<SpeechOutputChunk>;
}

export type MockSpeechOutputChunk = SpeechOutputPayload;

export interface MockTextToSpeechProviderOptions {
  readonly id?: string;
  readonly capabilities?: TextToSpeechCapabilities;
  readonly chunks?: readonly MockSpeechOutputChunk[];
}

const MOCK_TTS_CAPABILITIES: TextToSpeechCapabilities = {
  runtime: "browser",
  languages: ["en-US", "nl-NL"],
  streamingAudio: true,
  phonemeTiming: true,
  visemeTiming: true,
  wordTiming: true,
  emotionStyleControl: false,
};

export class MockTextToSpeechProvider implements TextToSpeechProvider {
  readonly id: string;
  readonly capabilities: TextToSpeechCapabilities;
  private readonly scriptedChunks: readonly MockSpeechOutputChunk[];

  constructor(options: MockTextToSpeechProviderOptions = {}) {
    this.id = options.id ?? "mock-tts";
    this.capabilities = options.capabilities ?? MOCK_TTS_CAPABILITIES;
    this.scriptedChunks = options.chunks ?? [];
  }

  async *speak(
    request: SpeechRequest,
    signal: AbortSignal,
  ): AsyncIterable<SpeechOutputChunk> {
    for (const [sequence, chunk] of this.scriptedChunks.entries()) {
      signal.throwIfAborted();
      yield {
        ...chunk,
        sessionId: request.sessionId,
        speechId: request.speechId,
        sequence,
      };
    }
  }
}

export interface SpeechConfiguration {
  stt: SpeechProviderSelection;
  tts: SpeechProviderSelection;
}

/**
 * Resolve STT and TTS independently. With "auto", the first provider in each
 * ordered candidate list wins; callers control the fallback policy.
 */
export function resolveSpeechProviders<
  TStt extends SpeechProviderDescriptor,
  TTts extends SpeechProviderDescriptor,
>(
  configuration: SpeechConfiguration,
  sttProviders: readonly TStt[],
  ttsProviders: readonly TTts[],
): { stt: TStt; tts: TTts } {
  const select = <T extends SpeechProviderDescriptor>(
    selection: SpeechProviderSelection,
    providers: readonly T[],
  ): T => {
    const provider =
      selection === "auto"
        ? providers[0]
        : providers.find(
            (candidate) => candidate.capabilities.runtime === selection,
          );
    if (!provider) {
      throw new Error(
        `No provider is registered for "${selection}" speech selection.`,
      );
    }
    return provider;
  };

  // Provider order is the automatic selection/fallback policy.
  return {
    stt: select(configuration.stt, sttProviders),
    tts: select(configuration.tts, ttsProviders),
  };
}

export interface SpeechConfigurationIssue {
  path: "stt" | "tts" | "";
  message: string;
}

export type SpeechConfigurationValidation =
  | { ok: true; configuration: SpeechConfiguration }
  | { ok: false; issues: SpeechConfigurationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProviderSelection(
  value: unknown,
): value is SpeechProviderSelection {
  return value === "browser" || value === "server" || value === "auto";
}

function readProviderSelection(
  value: unknown,
  path: "stt" | "tts",
  issues: SpeechConfigurationIssue[],
): SpeechProviderSelection | undefined {
  if (isProviderSelection(value)) return value;
  issues.push({
    path,
    message: 'Must be "browser", "server", or "auto".',
  });
  return undefined;
}

export function validateSpeechConfiguration(
  value: unknown,
): SpeechConfigurationValidation {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "", message: "Must be a speech configuration object." }],
    };
  }

  const issues: SpeechConfigurationIssue[] = [];
  const stt = readProviderSelection(value.stt, "stt", issues);
  const tts = readProviderSelection(value.tts, "tts", issues);
  if (stt === undefined || tts === undefined) {
    return { ok: false, issues };
  }

  return { ok: true, configuration: { stt, tts } };
}
