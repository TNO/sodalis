import {
  OpenAiCompatibleLlmProvider,
  type LlmTextGenerationProvider,
} from "./OpenAiCompatibleLlmProvider.js";

export interface LlmProviderSettings {
  readonly LLM_PROVIDER?: string;
  readonly LLM_BASE_URL?: string;
  readonly LLM_MODEL?: string;
  readonly LLM_API_KEY?: string;
}

export function createLlmProvider(settings: LlmProviderSettings): LlmTextGenerationProvider {
  switch (settings.LLM_PROVIDER) {
    case "mock":
      return {
        id: "mock",
        async *generate(request) {
          request.signal.throwIfAborted();
          yield JSON.stringify({
            text: "Dit is een testantwoord.",
            affect: { expression: "neutral", valence: 0, arousal: 0.1, intensity: 0.1 },
            interruptible: true,
          });
        },
      };
    case "openai-compatible":
      if (!settings.LLM_BASE_URL?.trim()) {
        throw new Error("Set LLM_BASE_URL for LLM_PROVIDER=openai-compatible.");
      }
      if (!settings.LLM_MODEL?.trim()) {
        throw new Error("Set LLM_MODEL for LLM_PROVIDER=openai-compatible.");
      }
      return new OpenAiCompatibleLlmProvider({
        baseUrl: settings.LLM_BASE_URL,
        model: settings.LLM_MODEL,
        ...(settings.LLM_API_KEY ? { apiKey: settings.LLM_API_KEY } : {}),
      });
    default:
      throw new Error(
        settings.LLM_PROVIDER
          ? `Unsupported LLM_PROVIDER "${settings.LLM_PROVIDER}".`
          : "Set LLM_PROVIDER to mock or openai-compatible.",
      );
  }
}
