import {
  OpenAiCompatibleLlmProvider,
  type LlmTextGenerationProvider,
} from "./OpenAiCompatibleLlmProvider.js";

export interface LlmProviderSettings {
  readonly LLM_PROVIDER?: string;
  readonly LLM_BASE_URL?: string;
  readonly LLM_MODEL?: string;
  readonly LLM_API_KEY?: string;
  readonly AZURE_LLM_URL?: string;
  readonly AZURE_LLM_KEY?: string;
  readonly AZURE_LLM_DEPLOYMENT?: string;
  readonly AZURE_LLM_REASONING_EFFORT?: string;
}

export interface LlmProviderOptions {
  readonly fetch?: typeof fetch;
}

const AZURE_LLM_HOSTS = [".openai.azure.com", ".services.ai.azure.com", ".cognitiveservices.azure.com"];
const AZURE_LLM_RESOURCE_ENDPOINT = "https://<resource>.openai.azure.com/openai/v1";
export const AZURE_LLM_REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;

/** The Azure OpenAI v1 base URL for an Azure OpenAI or Foundry resource endpoint. */
export function azureLlmEndpoint(value: string): string {
  const endpoint = new URL(value);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error("AZURE_LLM_URL must be an HTTPS URL without credentials.");
  }
  if (!AZURE_LLM_HOSTS.some((host) => endpoint.hostname.endsWith(host))) {
    throw new Error(`AZURE_LLM_URL must be an Azure OpenAI or Foundry resource endpoint (${
      AZURE_LLM_HOSTS.map((host) => `*${host}`).join(", ")}).`);
  }
  if (endpoint.pathname.startsWith("/api/projects/")) {
    throw new Error("AZURE_LLM_URL is a Foundry project endpoint; use the resource endpoint " +
      `${AZURE_LLM_RESOURCE_ENDPOINT} instead.`);
  }
  if (!["", "/", "/openai/v1", "/openai/v1/"].includes(endpoint.pathname) || endpoint.search) {
    throw new Error("AZURE_LLM_URL must be the Azure OpenAI v1 resource endpoint " +
      `${AZURE_LLM_RESOURCE_ENDPOINT}, not a deployment or operation URL.`);
  }
  return `https://${endpoint.host}/openai/v1`;
}

/** The validated Azure reasoning effort; `minimal` keeps spoken replies fast. */
export function azureLlmReasoningEffort(value: string | undefined): string {
  const effort = value?.trim() || "minimal";
  if (!(AZURE_LLM_REASONING_EFFORTS as readonly string[]).includes(effort)) {
    throw new Error(`AZURE_LLM_REASONING_EFFORT must be one of ${AZURE_LLM_REASONING_EFFORTS.join(", ")}.`);
  }
  return effort;
}

export function createLlmProvider(
  settings: LlmProviderSettings,
  options: LlmProviderOptions = {},
): LlmTextGenerationProvider {
  const fetchOption = options.fetch ? { fetch: options.fetch } : {};
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
        ...fetchOption,
      });
    case "azure": {
      if (!settings.AZURE_LLM_URL?.trim()) {
        throw new Error("Set AZURE_LLM_URL for LLM_PROVIDER=azure.");
      }
      const baseUrl = azureLlmEndpoint(settings.AZURE_LLM_URL);
      if (!settings.AZURE_LLM_KEY?.trim()) {
        throw new Error("Set AZURE_LLM_KEY for LLM_PROVIDER=azure.");
      }
      if (!settings.AZURE_LLM_DEPLOYMENT?.trim()) {
        throw new Error("Set AZURE_LLM_DEPLOYMENT for LLM_PROVIDER=azure.");
      }
      return new OpenAiCompatibleLlmProvider({
        id: "azure-openai-v1",
        baseUrl,
        model: settings.AZURE_LLM_DEPLOYMENT.trim(),
        apiKey: settings.AZURE_LLM_KEY.trim(),
        apiKeyHeader: "api-key",
        extraBody: { reasoning_effort: azureLlmReasoningEffort(settings.AZURE_LLM_REASONING_EFFORT) },
        ...fetchOption,
      });
    }
    default:
      throw new Error(
        settings.LLM_PROVIDER
          ? `Unsupported LLM_PROVIDER "${settings.LLM_PROVIDER}". Set LLM_PROVIDER to mock, openai-compatible or azure.`
          : "Set LLM_PROVIDER to mock, openai-compatible or azure.",
      );
  }
}
