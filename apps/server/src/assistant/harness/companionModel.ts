import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  InMemoryCredentialStore,
  type Model,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { azureLlmSettings, type LlmProviderSettings } from "../providers.js";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

/** The Pi model access for companion workflows, derived from the existing LLM settings. */
export interface CompanionModel {
  readonly modelRuntime: ModelRuntime;
  readonly model: Model<string>;
  readonly thinkingLevel: ThinkingLevel;
}

const PROVIDER_ID = "sodalis-llm";
/** Inert bearer token for keyless OpenAI-compatible servers; Pi requires a key. */
const NO_KEY = "sodalis-no-key";

/**
 * Pi resolves configured provider values as templates: `$NAME` reads an
 * environment variable and a leading `!` runs a shell command. Escape secrets
 * so they are always sent literally.
 */
export function literalConfigValue(value: string): string {
  const escaped = value.replace(/\$/g, "$$$$");
  return escaped.startsWith("!") ? `$${escaped}` : escaped;
}

async function emptyRuntime(): Promise<ModelRuntime> {
  return ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
}

function chatModel(id: string, reasoning: boolean, compat: Record<string, unknown>) {
  return {
    id,
    name: id,
    reasoning,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 1_024,
    compat,
  };
}

/**
 * Builds Pi model access for `LLM_PROVIDER` without reading Pi's local
 * auth/model files. `mock` answers every question with a fixed sentence and
 * makes no network calls.
 */
export async function createCompanionModel(settings: LlmProviderSettings): Promise<CompanionModel> {
  const modelRuntime = await emptyRuntime();
  switch (settings.LLM_PROVIDER) {
    case "mock": {
      const faux = fauxProvider({ provider: PROVIDER_ID, models: [{ id: "mock" }] });
      const reply = () => {
        faux.appendResponses([reply]);
        return fauxAssistantMessage(fauxText("Dit is een testantwoord."));
      };
      faux.setResponses([reply]);
      modelRuntime.registerNativeProvider(faux.provider);
      return { modelRuntime, model: faux.getModel(), thinkingLevel: "off" };
    }
    case "openai-compatible": {
      const baseUrl = settings.LLM_BASE_URL?.trim();
      const modelId = settings.LLM_MODEL?.trim();
      if (!baseUrl) throw new Error("Set LLM_BASE_URL for LLM_PROVIDER=openai-compatible.");
      if (!modelId) throw new Error("Set LLM_MODEL for LLM_PROVIDER=openai-compatible.");
      modelRuntime.registerProvider(PROVIDER_ID, {
        baseUrl: baseUrl.replace(/\/+$/, ""),
        api: "openai-completions",
        apiKey: literalConfigValue(settings.LLM_API_KEY?.trim() || NO_KEY),
        models: [chatModel(modelId, false, { supportsDeveloperRole: false, supportsStore: false })],
      });
      return { modelRuntime, model: modelRuntime.getModel(PROVIDER_ID, modelId)!, thinkingLevel: "off" };
    }
    case "azure": {
      const azure = azureLlmSettings(settings);
      const key = literalConfigValue(azure.key);
      const reasoning = azure.reasoningEffort !== "off";
      // Azure's v1 API accepts the key as a bearer token; `api-key` matches the existing provider.
      modelRuntime.registerProvider(PROVIDER_ID, {
        baseUrl: azure.url,
        api: "openai-completions",
        apiKey: key,
        headers: { "api-key": key },
        models: [chatModel(azure.deployment, reasoning, {
          supportsDeveloperRole: reasoning,
          supportsReasoningEffort: reasoning,
        })],
      });
      return {
        modelRuntime,
        model: modelRuntime.getModel(PROVIDER_ID, azure.deployment)!,
        thinkingLevel: reasoning ? azure.reasoningEffort as ThinkingLevel : "off",
      };
    }
    default:
      throw new Error("Set LLM_PROVIDER to mock, openai-compatible or azure.");
  }
}
