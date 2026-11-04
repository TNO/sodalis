import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
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

/** No discovery: only the explicit companion prompt, and no extensions, skills, templates or context files. */
function explicitResources(): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => COMPANION_SYSTEM_PROMPT,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
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
}

/** One temporary in-memory Pi session for a single foreground workflow. */
export async function createCompanionSession(options: CompanionSessionOptions): Promise<AgentSession> {
  const sessionManager = SessionManager.inMemory(NEUTRAL_CWD);
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
    resourceLoader: explicitResources(),
    customTools: [...options.tools],
    tools: options.tools.map((tool) => tool.name),
    sessionManager,
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
    }),
  });
  return session;
}
