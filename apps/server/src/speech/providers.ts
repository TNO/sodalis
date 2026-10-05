import type { SpeechRecognitionEngine } from "./WhisperCppHttpEngine.js";
import { WhisperCppHttpEngine } from "./WhisperCppHttpEngine.js";
import { LocalSpeechHttpEngine } from "./LocalSpeechHttpEngine.js";
import type { SpeechSynthesisEngine } from "./PiperTtsEngine.js";
import { PiperTtsEngine } from "./PiperTtsEngine.js";
import { PiperHttpEngine } from "./PiperHttpEngine.js";

export interface SpeechProviderSettings {
  readonly STT_PROVIDER?: string;
  readonly TTS_PROVIDER?: string;
  readonly WHISPER_CPP_URL?: string;
  readonly WHISTLE_URL?: string;
  readonly PARAKEET_TDT_URL?: string;
  readonly PIPER_MODEL_PATH?: string;
  readonly PIPER_EXECUTABLE?: string;
  readonly PIPER_HTTP_URL?: string;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`Set ${name} for the selected speech provider.`);
  return value;
}

export function createSpeechProviders(settings: SpeechProviderSettings): {
  stt: SpeechRecognitionEngine;
  tts: SpeechSynthesisEngine;
} {
  const stt: SpeechRecognitionEngine = (() => {
    switch (settings.STT_PROVIDER ?? "whisper-cpp") {
      case "whisper-cpp":
        return new WhisperCppHttpEngine({
          serverUrl: required(settings.WHISPER_CPP_URL, "WHISPER_CPP_URL"),
        });
      case "whistle":
        return new LocalSpeechHttpEngine({
          serverUrl: required(settings.WHISTLE_URL, "WHISTLE_URL"),
          name: "Whistle",
        });
      case "parakeet-tdt":
        return new LocalSpeechHttpEngine({
          serverUrl: required(settings.PARAKEET_TDT_URL, "PARAKEET_TDT_URL"),
          name: "Parakeet TDT",
        });
      case "mock":
        return {
          async transcribe({ signal }) {
            signal.throwIfAborted();
            return { text: "Dit is een test." };
          },
        };
      default:
        throw new Error(`Unsupported STT_PROVIDER "${settings.STT_PROVIDER}".`);
    }
  })();
  const tts: SpeechSynthesisEngine = (() => {
    switch (settings.TTS_PROVIDER ?? "piper") {
      case "piper":
        return new PiperTtsEngine({
          executable: settings.PIPER_EXECUTABLE ?? "piper",
          modelPath: required(settings.PIPER_MODEL_PATH, "PIPER_MODEL_PATH"),
        });
      case "piper-http":
        return new PiperHttpEngine({
          serverUrl: required(settings.PIPER_HTTP_URL, "PIPER_HTTP_URL"),
        });
      case "mock":
        return {
          async *synthesize(_request, signal) {
            signal.throwIfAborted();
            yield new Uint8Array([0, 0, 0, 0]);
          },
        };
      default:
        throw new Error(`Unsupported TTS_PROVIDER "${settings.TTS_PROVIDER}".`);
    }
  })();
  return { stt, tts };
}
