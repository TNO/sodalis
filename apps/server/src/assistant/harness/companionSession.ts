import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  createAgentSession,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ResourceLoader,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ConversationMessage } from "@sodalis/assistant";
import type { CompanionModel } from "./companionModel.js";
import { COMPANION_SYSTEM_PROMPT } from "./prompt.js";

/**
 * Pi always adds a `<cwd>` prompt section and resolves built-in tool paths
 * against it. No file tools are enabled, so a neutral root is used; no
 * session, settings or resource files are read or written there.
 */
const NEUTRAL_CWD = "/";

export type CompanionModelRequestObservation =
  | {
      readonly boundary: "context_with_system";
      readonly messages: readonly unknown[];
      readonly effectiveSystemPrompt?: string;
    }
  | { readonly boundary: "before_provider_request"; readonly payload: unknown };

/** No discovery: only the explicit companion prompt, and no user extensions, skills, templates or context files. */
async function explicitResources(
  observeModelRequest?: (observation: CompanionModelRequestObservation) => void,
  settingsManager = SettingsManager.inMemory(),
): Promise<ResourceLoader> {
  const loader = new DefaultResourceLoader({
    cwd: NEUTRAL_CWD,
    agentDir: "/nonexistent/sodalis-pi-agent",
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: COMPANION_SYSTEM_PROMPT,
    extensionFactories: observeModelRequest
      ? [{
          name: "sodalis-audit",
          hidden: true,
          factory: (pi) => {
            pi.on("context_with_system", (event) => {
              observeModelRequest({ boundary: "context_with_system", messages: event.messages });
            });
            pi.on("before_provider_request", (event) => {
              observeModelRequest({ boundary: "before_provider_request", payload: event.payload });
              return event.payload;
            });
          },
        }]
      : [],
  });
  await loader.reload();
  return loader;
}

function assistantHistoryMessage(model: CompanionModel["model"], text: string, timestamp: number): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp,
  };
}

export interface CompanionSessionOptions {
  readonly model: CompanionModel;
  /** Earlier resident conversation, oldest first; not the question being asked. */
  readonly history: readonly ConversationMessage[];
  readonly tools: readonly ToolDefinition[];
  readonly observeModelRequest?: (observation: CompanionModelRequestObservation) => void;
}

/** One temporary in-memory Pi session for a single foreground workflow. */
export async function createCompanionSession(options: CompanionSessionOptions): Promise<AgentSession> {
  const sessionManager = SessionManager.inMemory(NEUTRAL_CWD);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  let sessionReference: AgentSession | undefined;
  const observeModelRequest = options.observeModelRequest
    ? (observation: CompanionModelRequestObservation) => options.observeModelRequest!({
        ...observation,
        ...(observation.boundary === "context_with_system" && sessionReference
          ? { effectiveSystemPrompt: sessionReference.systemPrompt }
          : {}),
      })
    : undefined;
  const resourceLoader = await explicitResources(observeModelRequest, settingsManager);
  const start = Date.now() - options.history.length;
  options.history.forEach((message, index) => {
    sessionManager.appendMessage(
      message.role === "user"
        ? { role: "user", content: message.content, timestamp: start + index }
        : assistantHistoryMessage(options.model.model, message.content, start + index),
    );
  });
  const { session } = await createAgentSession({
    cwd: NEUTRAL_CWD,
    // Never read: the model runtime, settings and resources are all supplied explicitly.
    agentDir: "/nonexistent/sodalis-pi-agent",
    modelRuntime: options.model.modelRuntime,
    model: options.model.model,
    thinkingLevel: options.model.thinkingLevel,
    resourceLoader,
    customTools: [...options.tools],
    tools: options.tools.map((tool) => tool.name),
    sessionManager,
    settingsManager,
  });
  sessionReference = session;
  return session;
}
