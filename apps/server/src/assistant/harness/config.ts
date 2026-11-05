import type { LlmProviderSettings } from "../providers.js";
import { createCompanionModel } from "./companionModel.js";
import { createCompanionSession } from "./companionSession.js";
import { SqliteReadingsReader } from "./externalData.js";
import { Neo4jHomeGraph } from "./homeGraph.js";
import { createHomeTools } from "./tools.js";
import { FileCompanionAuditWriter } from "./audit.js";
import { CompanionWorkflows } from "./workflow.js";
import { createGmailEmailReader, createGraphEmailReader, createMockEmailReader } from "./emailReader.js";
import { EmailConnectionCoordinator, SystemEmailCredentialStore } from "./emailAuthorization.js";
import { isApprovedEmailQuestion, isEmailRelatedQuestion } from "./tools.js";
import {
  validateCompanionAuditSettings,
  validateCompanionSettings,
  validateReadingsFile,
  validateEmailSettings,
  type CompanionAuditSettings,
  type CompanionDataSettings,
  type EmailSettings,
} from "./settings.js";

export interface CompanionHarnessSettings extends LlmProviderSettings, CompanionDataSettings, CompanionAuditSettings, EmailSettings {}

const DEFAULT_SCOPE = "cphs:simulation:couple-apartment";
const DEFAULT_SQLITE_ENDPOINT = "local://simulation/timeseries.sqlite";

/**
 * The companion workflows from environment settings, or undefined when the
 * harness is switched off. The graph driver lives for the process lifetime.
 */
export async function createCompanionHarnessFromEnv(
  settings: CompanionHarnessSettings,
): Promise<CompanionWorkflows | undefined> {
  const emailProvider = validateEmailSettings(settings);
  const auditEnabled = validateCompanionAuditSettings(settings);
  if (validateCompanionSettings(settings) === "off") return undefined;
  const file = settings.HOME_DATA_SQLITE_FILE?.trim();
  if (file) validateReadingsFile(file);
  const model = await createCompanionModel(settings);
  const reader = file
    ? new SqliteReadingsReader({
        file,
        endpoint: settings.HOME_DATA_SQLITE_ENDPOINT?.trim() || DEFAULT_SQLITE_ENDPOINT,
      })
    : undefined;
  let graph: Neo4jHomeGraph | undefined;
  if (settings.HOME_GRAPH_URL?.trim()) {
    graph = new Neo4jHomeGraph({
      url: settings.HOME_GRAPH_URL.trim(),
      user: settings.HOME_GRAPH_USER?.trim() || "neo4j",
      password: settings.HOME_GRAPH_PASSWORD!,
      scope: settings.HOME_GRAPH_SCOPE?.trim() || DEFAULT_SCOPE,
      ...(settings.HOME_GRAPH_DATABASE?.trim() ? { database: settings.HOME_GRAPH_DATABASE.trim() } : {}),
      isReadable: (adapter, endpoint) => reader?.isReadable(adapter, endpoint) ?? false,
    });
    // An unreachable graph is reported by the tools as `unavailable`; startup continues.
    graph.warmUp().catch((error: unknown) => console.error("Home graph warm-up failed:", error));
  } else {
    console.warn("COMPANION_HARNESS=pi without HOME_GRAPH_URL: home tools report unavailable.");
  }
  const credentials = new SystemEmailCredentialStore();
  const emailConnections = emailProvider === "off"
    ? undefined
    : new EmailConnectionCoordinator({
        settings: {
          provider: emailProvider,
          residentId: settings.EMAIL_RESIDENT_ID!.trim(),
          ...(settings.EMAIL_OAUTH_CLIENT_ID?.trim() ? { clientId: settings.EMAIL_OAUTH_CLIENT_ID.trim() } : {}),
          ...(settings.EMAIL_OAUTH_CLIENT_SECRET_REF?.trim()
            ? { clientSecretRef: settings.EMAIL_OAUTH_CLIENT_SECRET_REF.trim() }
            : {}),
          ...(settings.EMAIL_OAUTH_REDIRECT_URI?.trim() ? { redirectUri: settings.EMAIL_OAUTH_REDIRECT_URI.trim() } : {}),
          ...(emailProvider === "graph" ? { graphTenant: settings.EMAIL_GRAPH_TENANT!.trim() } : {}),
        },
        credentials,
      });
  return new CompanionWorkflows({
    ...(auditEnabled ? { audit: new FileCompanionAuditWriter() } : {}),
    ...(emailConnections ? { emailConnections } : {}),
    createSession: ({ history, question, hostSessionId, budget }) => {
      const emailEnabled = emailProvider !== "off" && isApprovedEmailQuestion(question);
      const emailScopeLimited = !emailEnabled && isEmailRelatedQuestion(question);
      const emailReader = !emailEnabled
        ? undefined
        : emailProvider === "mock"
          ? createMockEmailReader()
          : emailProvider === "graph"
            ? createGraphEmailReader({
                resolveConnection: (handle) =>
                  hostSessionId ? emailConnections!.resolveForSession(hostSessionId, handle) : Promise.resolve(undefined),
              })
            : createGmailEmailReader({
                resolveConnection: (handle) =>
                  hostSessionId ? emailConnections!.resolveForSession(hostSessionId, handle) : Promise.resolve(undefined),
              });
      const emailConnectionHandle = emailEnabled && emailConnections && hostSessionId
        ? emailConnections.connectionHandleForSession(hostSessionId)
        : undefined;
      const tools = emailEnabled
        ? createHomeTools({
            emailReader: emailReader!,
            ...(emailConnectionHandle ? { emailConnectionHandle } : {}),
            emailAuditEnabled: auditEnabled,
            budget,
          }).filter((tool) => tool.name === "read_recent_inbox")
        : emailScopeLimited
          ? createHomeTools({ emailScopeLimited: true, emailProviderOff: emailProvider === "off", budget })
        : createHomeTools({
            ...(graph ? { graph } : {}),
            ...(reader ? { reader } : {}),
            budget,
          });
      return createCompanionSession({
        model,
        history: emailEnabled || emailScopeLimited ? [] : history,
        tools,
      });
    },
  });
}
