import {
  createAssistantActionRuntime,
  type AppActionDefinition,
  type AppActionInputProperty,
  type AppActionInputSchema,
  type AssistantActionRuntime,
} from "@sodalis/assistant";
import type { DesktopHost } from "@sodalis/desktop-host";
import type { createAppIntegrationRegistry } from "@sodalis/app-sdk";
import type { AttentionManager } from "../avatar/AttentionManager.js";
import { MockMailApplication } from "./MockMailApplication.js";

interface DesktopAssistantActionsOptions {
  readonly getHost: () => DesktopHost | undefined;
  readonly attention: AttentionManager;
  readonly mail?: MockMailApplication;
  readonly integrations?: Pick<ReturnType<typeof createAppIntegrationRegistry>, "getAvailableActions">;
}

function objectSchema(
  properties: Record<string, AppActionInputProperty> = {},
  required: readonly string[] = [],
): AppActionInputSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function stringProperty(
  description: string,
  maxLength = 500,
): AppActionInputProperty {
  return { type: "string", description, maxLength };
}

function stringArgument(
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = arguments_[name];
  if (typeof value !== "string") {
    throw new TypeError(`Action argument "${name}" must be text.`);
  }
  return value;
}

function messageSummary(
  messages: readonly {
    id: string;
    from: string;
    subject: string;
    receivedAt: string;
  }[],
): string {
  if (!messages.length) return "No messages found.";
  return messages
    .slice(0, 5)
    .map(
      (message) =>
        `${message.id} — ${message.subject} — ${message.from} — ${message.receivedAt}`,
    )
    .join("\n");
}

export function createDesktopAssistantActionRuntime(
  options: DesktopAssistantActionsOptions,
): AssistantActionRuntime {
  const mail = options.mail ?? new MockMailApplication();
  const definitions = (): readonly AppActionDefinition[] => {
    const host = options.getHost();
    const targets: ReturnType<AttentionManager["listTargets"]> = [];
    const targetDescriptions: string[] = [];
    let targetDescriptionLength =
      "Highlight and direct the avatar toward a visible semantic target. Available targets: ."
        .length;
    const targetCandidates = options.attention
      .listTargets()
      .filter((target) => target.id.length <= 128)
      .slice(0, 32);
    for (const target of targetCandidates) {
      const label =
        target.label.length > 80
          ? `${target.label.slice(0, 77)}...`
          : target.label;
      const entry = `${target.id} (${label})`;
      const separatorLength = targetDescriptions.length ? 2 : 0;
      if (targetDescriptionLength + separatorLength + entry.length > 950) {
        continue;
      }
      targets.push(target);
      targetDescriptions.push(entry);
      targetDescriptionLength += separatorLength + entry.length;
    }
    const actions: AppActionDefinition[] = [
      {
        id: "mail.list-messages",
        description: "List the most recent messages in the deterministic mock Mail app.",
        risk: "read",
        requiresConfirmation: false,
        inputSchema: objectSchema(),
        execute: () => messageSummary(mail.listMessages()),
      },
      {
        id: "mail.search-messages",
        description: "Search mock Mail by message text, sender, or subject.",
        risk: "read",
        requiresConfirmation: false,
        inputSchema: objectSchema(
          { query: stringProperty("Text to search for.", 200) },
          ["query"],
        ),
        execute: (args) =>
          messageSummary(mail.searchMessages(stringArgument(args, "query"))),
      },
      {
        id: "mail.open-message",
        description: "Open a mock Mail message by its semantic message ID.",
        risk: "navigate",
        requiresConfirmation: false,
        inputSchema: objectSchema(
          { messageId: stringProperty("Semantic message ID.", 128) },
          ["messageId"],
        ),
        execute: (args) => {
          const message = mail.openMessage(stringArgument(args, "messageId"));
          return `Opened "${message.subject}" from ${message.from}.`;
        },
      },
      {
        id: "mail.select-message",
        description: "Select a mock Mail message by its semantic message ID.",
        risk: "navigate",
        requiresConfirmation: false,
        inputSchema: objectSchema(
          { messageId: stringProperty("Semantic message ID.", 128) },
          ["messageId"],
        ),
        execute: (args) => {
          const message = mail.selectMessage(stringArgument(args, "messageId"));
          return `Selected "${message.subject}".`;
        },
      },
      {
        id: "mail.read-message",
        description: "Read the semantic content of a mock Mail message.",
        risk: "read",
        requiresConfirmation: false,
        inputSchema: objectSchema(
          { messageId: stringProperty("Semantic message ID.", 128) },
          ["messageId"],
        ),
        execute: (args) => {
          const message = mail.readMessage(stringArgument(args, "messageId"));
          return `From: ${message.from} <${message.fromAddress}>\nSubject: ${message.subject}\n${message.body}`;
        },
      },
      {
        id: "mail.create-draft",
        description: "Create a local mock Mail draft without sending it.",
        risk: "draft",
        requiresConfirmation: false,
        inputSchema: objectSchema(
          {
            to: stringProperty("Recipient address.", 200),
            subject: stringProperty("Draft subject.", 300),
            body: stringProperty("Draft message body.", 8_000),
          },
          ["to", "subject", "body"],
        ),
        execute: (args) => {
          const draft = mail.createDraft({
            to: stringArgument(args, "to"),
            subject: stringArgument(args, "subject"),
            body: stringArgument(args, "body"),
          });
          return `Created draft ${draft.id} for ${draft.to}: "${draft.subject}".`;
        },
      },
      {
        id: "mail.send",
        description: "Send a message through the mock Mail app.",
        risk: "external-effect",
        requiresConfirmation: true,
        inputSchema: objectSchema(
          {
            to: stringProperty("Recipient address.", 200),
            subject: stringProperty("Message subject.", 300),
            body: stringProperty("Message body.", 8_000),
          },
          ["to", "subject", "body"],
        ),
        confirmationPhrase: "confirm send",
        confirmationSummary: (args) =>
          `Send a message to ${stringArgument(args, "to")} with subject "${stringArgument(args, "subject")}" and body:\n${stringArgument(args, "body")}`,
        execute: (args) => {
          const sent = mail.send({
            to: stringArgument(args, "to"),
            subject: stringArgument(args, "subject"),
            body: stringArgument(args, "body"),
          });
          return `Sent mock message ${sent.id} to ${sent.to}: "${sent.subject}".`;
        },
      },
    ];
    if (host) {
      actions.push({
        id: "desktop.open-app",
        description: "Open a trusted built-in desktop application by its app ID.",
        risk: "navigate",
        requiresConfirmation: false,
        inputSchema: objectSchema(
          { appId: stringProperty("Trusted built-in app ID.", 128) },
          ["appId"],
        ),
        execute: async (args) => {
          const appId = stringArgument(args, "appId");
          const available = await host.listApplications();
          const app = available.find((item) => item.id === appId);
          if (!app) throw new Error(`Application "${appId}" is not available.`);
          await host.openApplication(appId);
          return `Opened ${app.title}.`;
        },
      });
    }
    if (targets.length) {
      const targetIds = targets.map((target) => target.id);
      actions.push({
        id: "desktop.focus-target",
        description: `Highlight and direct the avatar toward a visible semantic target. Available targets: ${targetDescriptions.join("; ")}.`,
        risk: "navigate",
        requiresConfirmation: false,
        inputSchema: objectSchema(
          {
            targetId: {
              ...stringProperty("Currently visible semantic UI target ID.", 128),
              enum: targetIds,
            },
          },
          ["targetId"],
        ),
        execute: (args) => {
          const targetId = stringArgument(args, "targetId");
          const target = options.attention.resolve(targetId);
          if (!target?.visible) {
            throw new Error(`Attention target "${targetId}" is not visible.`);
          }
          options.attention.focus(targetId);
          return `Focused ${target.label}.`;
        },
      });
    }
    return [...actions, ...(options.integrations?.getAvailableActions() ?? [])];
  };
  return createAssistantActionRuntime(definitions);
}
