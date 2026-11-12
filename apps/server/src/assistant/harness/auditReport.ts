import { sanitizeCompanionAuditRecord } from "./audit.js";

export type CompanionAuditReportEvent = Record<string, unknown> & {
  readonly event: string;
  readonly workflowId?: string;
  readonly sessionId?: string;
  readonly timestamp?: string;
};

export interface ParsedCompanionAuditJsonl {
  readonly events: CompanionAuditReportEvent[];
  readonly warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function truncatedJsonError(error: unknown): boolean {
  return error instanceof SyntaxError && /unexpected end|unterminated string/i.test(error.message);
}

export function parseCompanionAuditJsonl(source: string): ParsedCompanionAuditJsonl {
  const lines = source.split(/\r?\n/);
  const events: CompanionAuditReportEvent[] = [];
  const warnings: string[] = [];
  const hasTrailingNewline = source.endsWith("\n") || source.endsWith("\r");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      if (index === lines.length - 1 && !hasTrailingNewline && truncatedJsonError(error)) {
        warnings.push(`Truncated final JSONL record at line ${index + 1}; the report is partial.`);
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Malformed companion audit JSONL at line ${index + 1}: ${message}`);
    }
    if (!isRecord(value) || typeof value.event !== "string") {
      throw new Error(`Malformed companion audit JSONL at line ${index + 1}: expected an object with an event name.`);
    }
    events.push(sanitizeCompanionAuditRecord(value) as CompanionAuditReportEvent);
  }
  return { events, warnings };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timestampValue(event: CompanionAuditReportEvent): number {
  if (typeof event.timestamp !== "string") return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(event.timestamp);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function chronological(events: readonly CompanionAuditReportEvent[]): CompanionAuditReportEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => timestampValue(a.event) - timestampValue(b.event) || a.index - b.index)
    .map(({ event }) => event);
}

function displayText(event: CompanionAuditReportEvent): string {
  for (const key of ["text", "residentAnswer", "residentMessage"] as const) {
    if (typeof event[key] === "string" && event[key]) return event[key] as string;
  }
  return "";
}

function labelEvent(event: CompanionAuditReportEvent): string {
  switch (event.event) {
    case "user.message": return event.source === "conversation_history" ? "Earlier resident message" : "Resident question/input";
    case "workflow.input.accepted": return "Accepted steering input";
    case "assistant.message": return "Model narration";
    case "resident.answer": return "Resident answer";
    case "model.request.context": return "Effective model request context";
    case "model.request.provider_context": return "SDK-converted provider request context";
    case "tool.selected": return "Model-selected tool call";
    case "tool.dispatched": return "Host-dispatched tool call";
    case "host.tool.decision": return "Host execution decision";
    case "tool.result": return "Host tool result";
    case "host.workflow.decision": return "Host workflow decision";
    case "workflow.terminal": return `Terminal workflow outcome: ${String(event.outcome ?? "unknown")}`;
    default: return event.event;
  }
}

function usageLabel(event: CompanionAuditReportEvent): string {
  if (event.usageSource === "provider_reported" && isRecord(event.usage)) {
    return `provider-reported usage ${JSON.stringify(event.usage)}`;
  }
  if (event.usageSource === "unavailable") {
    return `usage unavailable: ${String(event.usageUnavailableReason ?? "no provider counts were recorded")}`;
  }
  if (isRecord(event.usage)) {
    const values = Object.values(event.usage);
    if (values.some((value) => value === "[REDACTED]")) {
      return "legacy usage is unavailable or redacted; previously redacted counts cannot be recovered";
    }
    return "legacy usage has no provider/source marker; counts are not treated as workflow totals";
  }
  return "usage unavailable in this record";
}

function eventDetails(event: CompanionAuditReportEvent): string {
  const timestamp = typeof event.timestamp === "string" ? event.timestamp : "timestamp unavailable";
  const summary = `${timestamp} — ${labelEvent(event)}`;
  const usage = event.event === "assistant.message" ? `<p>${escapeHtml(usageLabel(event))}</p>` : "";
  const text = displayText(event);
  return `<details class="event"><summary>${escapeHtml(summary)}</summary>${text ? `<p class="event-text">${escapeHtml(text)}</p>` : ""}${usage}<pre>${escapeHtml(JSON.stringify(event, null, 2))}</pre></details>`;
}

function correlationId(event: CompanionAuditReportEvent, field: string): string | undefined {
  return typeof event[field] === "string" ? event[field] as string : undefined;
}

function modelRequests(events: readonly CompanionAuditReportEvent[]): string {
  const requests = events.filter((event) => event.event === "model.request.context");
  if (!requests.length) return `<p class="notice">This log has no request-context records; effective prompts and offered tools are unavailable.</p>`;
  return `<section><h3>Model requests</h3>${requests.map((request) => {
    const requestId = correlationId(request, "modelRequestId");
    const linked = requestId
      ? events.filter((event) => event !== request && correlationId(event, "modelRequestId") === requestId)
      : [];
    return `<details class="request"><summary>Turn ${escapeHtml(request.modelTurn ?? "unavailable")} · ${escapeHtml(requestId ?? "request id unavailable")} · ${escapeHtml(isRecord(request.model) ? request.model.id ?? "model unavailable" : "model unavailable")}</summary>${eventDetails(request)}${linked.map(eventDetails).join("")}</details>`;
  }).join("")}</section>`;
}

function toolCalls(events: readonly CompanionAuditReportEvent[]): string {
  const selections = events.filter((event) => event.event === "tool.selected");
  if (!selections.length) return `<section><h3>Tool calls</h3><p>No tool calls were selected.</p></section>`;
  return `<section><h3>Tool calls</h3>${selections.map((selection) => {
    const id = correlationId(selection, "toolCallId");
    const linked = id
      ? events.filter((event) => event !== selection && correlationId(event, "toolCallId") === id)
      : [];
    return `<details class="tool-call"><summary>${escapeHtml(selection.toolName ?? "tool unavailable")} · ${escapeHtml(id ?? "call id unavailable")} · selection is separate from host execution</summary>${eventDetails(selection)}${linked.map(eventDetails).join("")}</details>`;
  }).join("")}</section>`;
}

function questionFor(events: readonly CompanionAuditReportEvent[]): string {
  const question = events.find((event) =>
    event.event === "user.message" && event.source !== "conversation_history",
  ) ?? events.find((event) => event.event === "user.message");
  return question ? displayText(question) : "";
}

function workflowReport(events: readonly CompanionAuditReportEvent[]): string {
  const first = events[0]!;
  const sessionId = typeof first.sessionId === "string" ? first.sessionId : "session unavailable";
  const workflowId = typeof first.workflowId === "string" ? first.workflowId : "workflow unavailable";
  const terminal = [...events].reverse().find((event) => event.event === "workflow.terminal");
  const answer = terminal && typeof terminal.residentAnswer === "string" ? terminal.residentAnswer : "";
  const question = questionFor(events);
  const hasLegacyUsage = events.some((event) =>
    event.event === "assistant.message" && event.usageSource === undefined,
  );
  const hasRequestContext = events.some((event) => event.event === "model.request.context");
  const ordered = chronological(events);
  return `<article class="workflow"><header><h2>${escapeHtml(workflowId)}</h2><p>Session: ${escapeHtml(sessionId)} · Outcome: <strong>${escapeHtml(terminal?.outcome ?? "incomplete")}</strong></p>${question ? `<p><strong>Question/input:</strong> ${escapeHtml(question)}</p>` : `<p><strong>Question/input:</strong> unavailable in this log</p>`}${answer ? `<p><strong>Resident answer:</strong> ${escapeHtml(answer)}</p>` : ""}${!terminal ? `<p class="notice">Incomplete workflow: no terminal outcome was recorded.</p>` : ""}${!hasRequestContext ? `<p class="notice">This older log has no request-context records; effective prompts and offered tools are unavailable.</p>` : ""}${hasLegacyUsage ? `<p class="notice">Legacy usage may be missing or redacted; unavailable counts are not reconstructed or summed.</p>` : ""}</header>${modelRequests(ordered)}${toolCalls(ordered)}<section><h3>Chronological timeline</h3>${ordered.map(eventDetails).join("")}</section></article>`;
}

export function renderCompanionAuditHtml(
  inputEvents: readonly CompanionAuditReportEvent[],
  warnings: readonly string[],
): string {
  const sanitized = inputEvents.map((event) =>
    sanitizeCompanionAuditRecord(event) as CompanionAuditReportEvent,
  );
  const workflows = new Map<string, CompanionAuditReportEvent[]>();
  for (const event of chronological(sanitized)) {
    const key = `${String(event.sessionId ?? "session unavailable")}\u0000${String(event.workflowId ?? "workflow unavailable")}`;
    const group = workflows.get(key) ?? [];
    group.push(event);
    workflows.set(key, group);
  }
  const warningMarkup = warnings.length
    ? `<section class="warning"><h2>Partial log warning</h2><ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></section>`
    : "";
  const body = [...workflows.values()].map(workflowReport).join("") || "<p>No audit records were found.</p>";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Offline companion developer audit</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#17212b;background:#f7f9fb}
h1,h2,h3{line-height:1.2}.workflow,.warning{background:white;border:1px solid #ccd5de;border-radius:.5rem;padding:1rem;margin:1rem 0}
.warning,.notice{color:#7d3500}.request,.tool-call{margin:.5rem 0 1rem 1rem}.event{margin:.5rem 0 0 1rem}
summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f3f5;padding:.75rem;border-radius:.3rem}
.event-text{white-space:pre-wrap;overflow-wrap:anywhere}
</style></head><body><h1>Offline companion developer audit</h1>
<p>Sanitized local diagnostic data. It does not expose private reasoning and does not prove why the model selected a tool.</p>
${warningMarkup}${body}</body></html>`;
}
