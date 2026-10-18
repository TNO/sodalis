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
/** `off` omits `reasoning_effort` for non-reasoning deployments such as gpt-4.1-mini. */
const AZURE_LLM_REASONING_SETTINGS = [...AZURE_LLM_REASONING_EFFORTS, "off"] as const;

/** The Azure OpenAI v1 base URL for an Azure OpenAI or Foundry resource endpoint. */
function azureLlmEndpoint(value: string): string {
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

export type AzureLlmReasoningEffort = (typeof AZURE_LLM_REASONING_SETTINGS)[number];

/** The validated Azure reasoning effort; `minimal` keeps spoken replies fast. */
function azureLlmReasoningEffort(value: string | undefined): AzureLlmReasoningEffort {
  const effort = value?.trim() || "minimal";
  const known = AZURE_LLM_REASONING_SETTINGS.find((candidate) => candidate === effort);
  if (!known) {
    throw new Error(`AZURE_LLM_REASONING_EFFORT must be one of ${AZURE_LLM_REASONING_SETTINGS.join(", ")}.`);
  }
  return known;
}

export interface AzureLlmSettings {
  /** Normalised `https://<host>/openai/v1` base URL. */
  readonly url: string;
  readonly key: string;
  readonly deployment: string;
  readonly reasoningEffort: AzureLlmReasoningEffort;
}

/** Validates the `AZURE_LLM_*` settings for both the AI service and the stack configuration. */
export function azureLlmSettings(settings: LlmProviderSettings): AzureLlmSettings {
  if (!settings.AZURE_LLM_URL?.trim()) {
    throw new Error("Set AZURE_LLM_URL for LLM_PROVIDER=azure.");
  }
  const url = azureLlmEndpoint(settings.AZURE_LLM_URL);
  if (!settings.AZURE_LLM_KEY?.trim()) {
    throw new Error("Set AZURE_LLM_KEY for LLM_PROVIDER=azure.");
  }
  if (!settings.AZURE_LLM_DEPLOYMENT?.trim()) {
    throw new Error("Set AZURE_LLM_DEPLOYMENT for LLM_PROVIDER=azure.");
  }
  return {
    url,
    key: settings.AZURE_LLM_KEY.trim(),
    deployment: settings.AZURE_LLM_DEPLOYMENT.trim(),
    reasoningEffort: azureLlmReasoningEffort(settings.AZURE_LLM_REASONING_EFFORT),
  };
}

/** Request fields for the configured effort; empty when the effort is `off`. */
export function azureLlmExtraBody(settings: LlmProviderSettings): Record<string, unknown> {
  const { reasoningEffort } = azureLlmSettings(settings);
  return reasoningEffort === "off" ? {} : { reasoning_effort: reasoningEffort };
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
      const azure = azureLlmSettings(settings);
      return new OpenAiCompatibleLlmProvider({
        id: "azure-openai-v1",
        baseUrl: azure.url,
        model: azure.deployment,
        apiKey: azure.key,
        apiKeyHeader: "api-key",
        extraBody: azureLlmExtraBody(settings),
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
