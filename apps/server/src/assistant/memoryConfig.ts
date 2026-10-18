import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  LlmDecisionGate,
  Consolidator,
  LlmExtractor,
  LlmInducer,
  LlmReconciler,
  Memory,
  MemoryService,
  MockEmbedder,
  OpenAiCompatibleChatClient,
  OpenAiCompatibleEmbedder,
  PassThroughGate,
  type ChatClient,
  type DecisionGate,
  type Embedder,
  type OpenAiCompatibleChatClientOptions,
} from "@sodalis/memory";
import { azureLlmExtraBody, azureLlmSettings, type LlmProviderSettings } from "./providers.js";

export interface MemorySettings extends LlmProviderSettings {
  readonly MEMORY_ENABLED?: string;
  readonly MEMORY_DB_PATH?: string;
  readonly MEMORY_REQUIRE_CONSENT?: string;
  readonly MEMORY_CONSOLIDATION?: string;
  readonly MEMORY_OBSERVATION_SOURCES?: string;
  readonly MEMORY_EMBED_PROVIDER?: string;
  readonly MEMORY_EMBED_BASE_URL?: string;
  readonly MEMORY_EMBED_MODEL?: string;
  readonly MEMORY_EMBED_DIMS?: string;
  readonly MEMORY_EMBED_API_KEY?: string;
  readonly MEMORY_GATE_PROVIDER?: string;
  readonly MEMORY_GATE_BASE_URL?: string;
  readonly MEMORY_GATE_MODEL?: string;
  readonly MEMORY_GATE_API_KEY?: string;
  readonly MEMORY_GATE_EXTRA_BODY?: string;
  readonly MEMORY_GATE_THRESHOLD?: string;
  readonly MEMORY_EXTRACT_PROVIDER?: string;
  readonly MEMORY_EXTRACT_BASE_URL?: string;
  readonly MEMORY_EXTRACT_MODEL?: string;
  readonly MEMORY_EXTRACT_API_KEY?: string;
  readonly MEMORY_EXTRACT_EXTRA_BODY?: string;
  readonly MEMORY_EXTRACT_RESPONSE_FORMAT?: string;
  readonly MEMORY_TOKEN_BUDGET?: string;
  readonly MEMORY_MIN_SIMILARITY?: string;
}

export interface MemoryConfigOptions {
  readonly fetch?: typeof fetch;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) return false;
  throw new Error(`Expected a boolean, got "${value}".`);
}

function number(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}.`);
  }
  return parsed;
}

function jsonObject(name: string, value: string | undefined): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${name} must be a JSON object.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Set ${name} when MEMORY_ENABLED is on.`);
  return value.trim();
}

function createEmbedder(settings: MemorySettings, fetcher?: typeof fetch): Embedder {
  const dimensions = number("MEMORY_EMBED_DIMS", settings.MEMORY_EMBED_DIMS, 512, 8, 4096);
  switch (settings.MEMORY_EMBED_PROVIDER ?? "openai-compatible") {
    case "mock":
      return new MockEmbedder(dimensions);
    case "openai-compatible":
      return new OpenAiCompatibleEmbedder({
        baseUrl: required("MEMORY_EMBED_BASE_URL", settings.MEMORY_EMBED_BASE_URL),
        model: required("MEMORY_EMBED_MODEL", settings.MEMORY_EMBED_MODEL),
        dimensions,
        ...(settings.MEMORY_EMBED_API_KEY ? { apiKey: settings.MEMORY_EMBED_API_KEY } : {}),
        ...(fetcher ? { fetch: fetcher } : {}),
      });
    default:
      throw new Error("MEMORY_EMBED_PROVIDER must be openai-compatible or mock.");
  }
}

function createGate(settings: MemorySettings, fetcher?: typeof fetch): DecisionGate {
  switch (settings.MEMORY_GATE_PROVIDER ?? "openai-compatible") {
    case "pass-through":
      return new PassThroughGate();
    case "openai-compatible": {
      const extraBody = jsonObject("MEMORY_GATE_EXTRA_BODY", settings.MEMORY_GATE_EXTRA_BODY);
      return new LlmDecisionGate(
        new OpenAiCompatibleChatClient({
          id: "memory-gate",
          baseUrl: required("MEMORY_GATE_BASE_URL", settings.MEMORY_GATE_BASE_URL),
          model: required("MEMORY_GATE_MODEL", settings.MEMORY_GATE_MODEL),
          ...(settings.MEMORY_GATE_API_KEY ? { apiKey: settings.MEMORY_GATE_API_KEY } : {}),
          ...(extraBody ? { extraBody } : {}),
          timeoutMs: 30_000,
          ...(fetcher ? { fetch: fetcher } : {}),
        }),
      );
    }
    default:
      throw new Error("MEMORY_GATE_PROVIDER must be openai-compatible or pass-through.");
  }
}

/** The extraction and reconciliation model; local by default, Azure on request. */
function createExtractionClient(settings: MemorySettings, fetcher?: typeof fetch): ChatClient {
  const fetchOption = fetcher ? { fetch: fetcher } : {};
  const extraBody = jsonObject("MEMORY_EXTRACT_EXTRA_BODY", settings.MEMORY_EXTRACT_EXTRA_BODY);
  const format = settings.MEMORY_EXTRACT_RESPONSE_FORMAT;
  if (format !== undefined && !["json_schema", "json_object", "none"].includes(format)) {
    throw new Error("MEMORY_EXTRACT_RESPONSE_FORMAT must be json_schema, json_object, or none.");
  }
  const responseFormat = format ? { responseFormatSupport: format as OpenAiCompatibleChatClientOptions["responseFormatSupport"] } : {};
  switch (settings.MEMORY_EXTRACT_PROVIDER ?? "openai-compatible") {
    case "openai-compatible":
      return new OpenAiCompatibleChatClient({
        id: "memory-extract",
        baseUrl: required("MEMORY_EXTRACT_BASE_URL", settings.MEMORY_EXTRACT_BASE_URL),
        model: required("MEMORY_EXTRACT_MODEL", settings.MEMORY_EXTRACT_MODEL),
        ...(settings.MEMORY_EXTRACT_API_KEY ? { apiKey: settings.MEMORY_EXTRACT_API_KEY } : {}),
        ...(extraBody ? { extraBody } : {}),
        ...responseFormat,
        ...fetchOption,
      });
    case "azure": {
      const azure = azureLlmSettings(settings);
      return new OpenAiCompatibleChatClient({
        id: "memory-extract-azure",
        baseUrl: azure.url,
        model: settings.MEMORY_EXTRACT_MODEL?.trim() || azure.deployment,
        apiKey: azure.key,
        apiKeyHeader: "api-key",
        extraBody: { ...azureLlmExtraBody(settings), ...extraBody },
        sendTemperature: false,
        ...responseFormat,
        ...fetchOption,
      });
    }
    default:
      throw new Error("MEMORY_EXTRACT_PROVIDER must be openai-compatible or azure.");
  }
}

export interface MemoryRuntime {
  readonly service: MemoryService;
  readonly observationSources: readonly string[];
}

/** Builds long-term memory from the environment; undefined when it is off. */
export async function createMemoryFromEnv(
  settings: MemorySettings,
  options: MemoryConfigOptions = {},
): Promise<MemoryRuntime | undefined> {
  if (!flag(settings.MEMORY_ENABLED, false)) return undefined;
  const path = settings.MEMORY_DB_PATH?.trim() || "data/memory.db";
  const embedder = createEmbedder(settings, options.fetch);
  const gate = createGate(settings, options.fetch);
  const extraction = createExtractionClient(settings, options.fetch);
  const tokenBudget = number("MEMORY_TOKEN_BUDGET", settings.MEMORY_TOKEN_BUDGET, 800, 100, 8_000);
  const minSimilarity = number("MEMORY_MIN_SIMILARITY", settings.MEMORY_MIN_SIMILARITY, 0.35, 0, 1);
  const gateThreshold = number("MEMORY_GATE_THRESHOLD", settings.MEMORY_GATE_THRESHOLD, 0.3, 0, 1);
  const observationSources = (settings.MEMORY_OBSERVATION_SOURCES ?? "home")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const memory = await Memory.open({ path, embedder });
  const service = new MemoryService({
    memory,
    gate,
    extractor: new LlmExtractor(extraction),
    reconciler: new LlmReconciler(extraction),
    gateThreshold,
    requireConsent: flag(settings.MEMORY_REQUIRE_CONSENT, true),
    retrieval: { tokenBudget, minSimilarity },
    queue: { onError: (job, error) => console.error(`Memory job ${job.id} failed:`, error) },
    ...(flag(settings.MEMORY_CONSOLIDATION, true)
      ? { consolidator: new Consolidator({ memory, inducer: new LlmInducer(extraction) }) }
      : {}),
  });
  return { service, observationSources };
}
