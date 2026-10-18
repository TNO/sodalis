import {
  InstrumentedChatClient,
  OpenAiCompatibleChatClient,
  type ChatClient,
  type RoleStats,
} from "../src/ChatClient.js";
import { LlmInducer } from "../src/Consolidator.js";
import { LlmDecisionGate, PassThroughGate, type DecisionGate } from "../src/DecisionGate.js";
import { MockEmbedder, OpenAiCompatibleEmbedder, type Embedder } from "../src/Embedder.js";
import { LlmExtractor } from "../src/Extractor.js";
import { LlmReconciler, type Reconciler } from "../src/Reconciler.js";
import type { Extractor } from "../src/Extractor.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalRoles } from "./harness.js";
import { TransformersEmbedder } from "./transformersEmbedder.js";

export type Env = Readonly<Record<string, string | undefined>>;
export const CHAT_ROLES = ["GATE", "EXTRACT", "RECONCILE", "ANSWER", "JUDGE", "RENDER", "INDUCE", "TRANSLATE"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** Roles that fall back to another role's settings when unset. */
const FALLBACK: Partial<Record<ChatRole, ChatRole>> = { RECONCILE: "EXTRACT", ANSWER: "EXTRACT", INDUCE: "EXTRACT", TRANSLATE: "ANSWER" };
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LOCAL_HOSTS.has(host) || host.endsWith(".local");
  } catch {
    return false;
  }
}

function json(value: string | undefined, name: string): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function roleKey(env: Env, role: ChatRole, key: string): string | undefined {
  const own = env[`EVAL_${role}_${key}`];
  if (own !== undefined && own !== "") return own;
  const fallback = FALLBACK[role];
  return fallback ? roleKey(env, fallback, key) : undefined;
}

export function chatConfigured(env: Env, role: ChatRole): boolean {
  return !!roleKey(env, role, "BASE_URL") && !!roleKey(env, role, "MODEL");
}

/** Every base URL the configuration would send data to. */
export function configuredUrls(
  env: Env,
  roles: readonly ChatRole[],
  options: { includeEmbedder?: boolean } = {},
): string[] {
  const urls = roles.flatMap((role) => (chatConfigured(env, role) ? [roleKey(env, role, "BASE_URL")!] : []));
  if (options.includeEmbedder !== false && env.EVAL_EMBED_PROVIDER !== "mock" && env.EVAL_EMBED_BASE_URL) {
    urls.push(env.EVAL_EMBED_BASE_URL);
  }
  return urls;
}

/** Enforces the cloud-consent rule (AGENTS.md): remote URLs need `--allow-cloud`. */
export function assertLocalOnly(
  env: Env,
  roles: readonly ChatRole[],
  allowCloud: boolean,
  options: { includeEmbedder?: boolean } = {},
): void {
  const remote = configuredUrls(env, roles, options).filter((url) => !isLocalUrl(url));
  if (remote.length && !allowCloud) {
    throw new Error(
      `This run would send data to ${[...new Set(remote)].join(", ")}. Get the user's consent for this run and pass --allow-cloud.`,
    );
  }
}

export function chatClient(env: Env, role: ChatRole): ChatClient {
  const baseUrl = roleKey(env, role, "BASE_URL");
  const model = roleKey(env, role, "MODEL");
  if (!baseUrl || !model) throw new Error(`Set EVAL_${role}_BASE_URL and EVAL_${role}_MODEL.`);
  const apiKey = roleKey(env, role, "API_KEY");
  const extraBody = json(roleKey(env, role, "EXTRA_BODY"), `EVAL_${role}_EXTRA_BODY`);
  const format = roleKey(env, role, "RESPONSE_FORMAT");
  const header = roleKey(env, role, "API_KEY_HEADER");
  return new OpenAiCompatibleChatClient({
    id: `${role.toLowerCase()}:${model}`,
    baseUrl,
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(header === "api-key" || header === "authorization" ? { apiKeyHeader: header } : {}),
    ...(extraBody ? { extraBody } : {}),
    ...(format === "json_object" || format === "none" || format === "json_schema" ? { responseFormatSupport: format } : {}),
    ...(roleKey(env, role, "SEND_TEMPERATURE") === "false" ? { sendTemperature: false } : {}),
    timeoutMs: Number(roleKey(env, role, "TIMEOUT_MS") ?? 300_000),
  });
}

export function embedderFromEnv(env: Env): Embedder {
  const dimensions = Number(env.EVAL_EMBED_DIMS ?? 512);
  if ((env.EVAL_EMBED_PROVIDER ?? "openai-compatible") === "mock") return new MockEmbedder(dimensions);
  if (env.EVAL_EMBED_PROVIDER === "transformers") {
    return new TransformersEmbedder({
      model: env.EVAL_EMBED_MODEL ?? "ibm-granite/granite-embedding-311m-multilingual-r2",
      dimensions,
      localModelPath: env.EVAL_EMBED_MODEL_PATH ?? join(dirname(fileURLToPath(import.meta.url)), ".data", "models") + "/",
      ...(env.EVAL_EMBED_POOLING === "mean" ? { pooling: "mean" as const } : {}),
    });
  }
  if (!env.EVAL_EMBED_BASE_URL || !env.EVAL_EMBED_MODEL) {
    throw new Error("Set EVAL_EMBED_BASE_URL and EVAL_EMBED_MODEL, or EVAL_EMBED_PROVIDER=mock.");
  }
  return new OpenAiCompatibleEmbedder({
    baseUrl: env.EVAL_EMBED_BASE_URL,
    model: env.EVAL_EMBED_MODEL,
    dimensions,
    ...(env.EVAL_EMBED_API_KEY ? { apiKey: env.EVAL_EMBED_API_KEY } : {}),
  });
}

export interface InstrumentedRoles {
  readonly roles: EvalRoles;
  readonly stats: () => Record<string, RoleStats>;
}

/** Builds the model roles from `EVAL_*` settings, instrumented per role. */
export function rolesFromEnv(env: Env, options: { memoryEnabled?: boolean } = {}): InstrumentedRoles {
  const clients: Partial<Record<ChatRole, InstrumentedChatClient>> = {};
  const client = (role: ChatRole) => (clients[role] ??= new InstrumentedChatClient(chatClient(env, role)));
  if (options.memoryEnabled === false) {
    const unused = new Error("Memory roles are unavailable in a no-memory evaluation.");
    const extractor: Extractor = { id: "disabled", async extract() { throw unused; } };
    const reconciler: Reconciler = { id: "disabled", async reconcile() { throw unused; } };
    return {
      roles: {
        embedder: new MockEmbedder(),
        gate: new PassThroughGate(),
        extractor,
        reconciler,
        answer: client("ANSWER"),
        ...(chatConfigured(env, "JUDGE") ? { judge: client("JUDGE") } : {}),
      },
      stats: () => Object.fromEntries(Object.entries(clients).map(([role, value]) => [role.toLowerCase(), { ...value.stats }])),
    };
  }
  const gate: DecisionGate =
    (env.EVAL_GATE_PROVIDER ?? "openai-compatible") === "pass-through" || !chatConfigured(env, "GATE")
      ? new PassThroughGate()
      : new LlmDecisionGate(client("GATE"));
  const extract = client("EXTRACT");
  return {
    roles: {
      embedder: embedderFromEnv(env),
      gate,
      extractor: new LlmExtractor(extract),
      reconciler: new LlmReconciler(client("RECONCILE")),
      answer: client("ANSWER"),
      ...(chatConfigured(env, "JUDGE") ? { judge: client("JUDGE") } : {}),
      inducer: new LlmInducer(client("INDUCE")),
    },
    stats: () => Object.fromEntries(Object.entries(clients).map(([role, value]) => [role.toLowerCase(), { ...value.stats }])),
  };
}
