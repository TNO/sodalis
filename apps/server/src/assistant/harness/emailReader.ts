const DAY_MS = 24 * 60 * 60 * 1_000;
const WINDOW_MS = 7 * DAY_MS;
const MAX_BODY_BYTES = 8_192;

export type EmailReadStatus = "ok" | "empty" | "unauthorized" | "unavailable" | "partial";

export interface EmailReaderRequest {
  readonly since: string;
  readonly until: string;
  readonly limit: 5;
  readonly signal: AbortSignal;
}

export interface EmailEvidenceMessage {
  readonly provider: string;
  readonly sender: { readonly name: string; readonly address: string };
  readonly subject: string;
  readonly receivedAt: string;
  readonly body: string;
  readonly bodyAvailability: "available" | "missing" | "truncated";
  readonly source: {
    readonly kind: "synthetic" | "provider";
    readonly label: string;
    readonly reference: string;
  };
}

export interface EmailReadResult {
  readonly status: EmailReadStatus;
  readonly provider: string;
  readonly sourceLabel: string;
  readonly window: { readonly since: string; readonly until: string };
  readonly checkedAt: string;
  readonly coverage: "complete" | "incomplete";
  readonly messages: readonly EmailEvidenceMessage[];
}

export interface ReadOnlyEmailReader {
  readRecentInbox(request: EmailReaderRequest): Promise<EmailReadResult>;
}

export interface MockEmail {
  readonly id: string;
  readonly receivedAt: string;
  readonly senderName?: string;
  readonly senderAddress?: string;
  readonly subject?: string;
  readonly body?: string;
  readonly inbox?: boolean;
  readonly draft?: boolean;
}

export interface MockEmailReaderOptions {
  readonly messages?: readonly MockEmail[];
  readonly status?: Exclude<EmailReadStatus, "unauthorized">;
  readonly now?: () => number;
}

export const EMAIL_FIXTURE_MESSAGES: readonly MockEmail[] = [
  { id: "M01", receivedAt: "2026-11-05T11:00:00.000Z", senderName: "Ana", senderAddress: "ana@example.test", subject: "Visit", body: "I will visit Friday at 14:00." },
  { id: "M02", receivedAt: "2026-11-04T15:00:00.000Z", senderName: "Bo", senderAddress: "bo@example.test", subject: "Delivery", body: "The parcel arrives Monday." },
  { id: "M03", receivedAt: "2026-11-03T09:00:00.000Z", senderName: "Cy", senderAddress: "cy@example.test", subject: "Library", body: "Your book is ready." },
  { id: "M04", receivedAt: "2026-11-02T10:00:00.000Z", senderName: "Dee", senderAddress: "dee@example.test", subject: "Lunch", body: "Lunch is at noon." },
  { id: "M05", receivedAt: "2026-11-02T10:00:00.000Z", senderName: "Eli", senderAddress: "eli@example.test", subject: "Walk", body: "Meet at the park gate." },
  { id: "M06", receivedAt: "2026-11-01T14:00:00.000Z", senderName: "Fay", senderAddress: "fay@example.test", subject: "Receipt", body: "Payment received." },
  { id: "M07", receivedAt: "2026-10-29T12:00:00.000Z", senderName: "Gus", senderAddress: "gus@example.test", subject: "Boundary", body: "Start of window." },
  { id: "M08", receivedAt: "2026-10-29T11:59:59.000Z", senderName: "Synthetic sender", senderAddress: "old@example.test", subject: "Old", body: "Outside window." },
  { id: "M09", receivedAt: "2026-11-05T12:00:00.000Z", senderName: "Synthetic sender", senderAddress: "future@example.test", subject: "Future edge", body: "Outside window." },
  { id: "M10", receivedAt: "2026-11-05T11:30:00.000Z", senderName: "Synthetic sender", senderAddress: "sent@example.test", subject: "Sent", body: "Sent only.", inbox: false },
  { id: "M11", receivedAt: "2026-11-05T11:30:00.000Z", senderName: "Synthetic sender", senderAddress: "draft@example.test", subject: "Draft", body: "Draft.", draft: true },
  { id: "M12", receivedAt: "2026-11-05T11:30:00.000Z", senderName: "Synthetic sender", senderAddress: "spam@example.test", subject: "Spam", body: "Spam.", inbox: false },
  { id: "M13", receivedAt: "2026-11-05T11:30:00.000Z", senderName: "Synthetic sender", senderAddress: "trash@example.test", subject: "Trash", body: "Trash.", inbox: false },
];

function validWindow(request: EmailReaderRequest): boolean {
  const since = Date.parse(request.since);
  const until = Date.parse(request.until);
  return request.limit === 5 &&
    Number.isFinite(since) &&
    Number.isFinite(until) &&
    until - since === WINDOW_MS &&
    request.since.endsWith("Z") &&
    request.until.endsWith("Z");
}

function result(
  status: EmailReadStatus,
  request: EmailReaderRequest,
  now: () => number,
  messages: readonly EmailEvidenceMessage[] = [],
  coverage: "complete" | "incomplete" = status === "ok" || status === "empty" ? "complete" : "incomplete",
): EmailReadResult {
  return {
    status,
    provider: "mock",
    sourceLabel: "Synthetic inbox",
    window: { since: request.since, until: request.until },
    checkedAt: new Date(now()).toISOString(),
    coverage,
    messages,
  };
}

function normalizeText(value: string | undefined, fallback: string): string {
  return value?.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim() || fallback;
}

function evidenceMessage(message: MockEmail, receivedAt: number): EmailEvidenceMessage {
  const body = message.body ?? "";
  const bytes = new TextEncoder().encode(body);
  const truncated = bytes.byteLength > MAX_BODY_BYTES;
  return {
    provider: "mock",
    sender: {
      name: normalizeText(message.senderName, "Unknown"),
      address: normalizeText(message.senderAddress, "Unknown"),
    },
    subject: normalizeText(message.subject, "Subject unavailable"),
    receivedAt: new Date(receivedAt).toISOString(),
    body: truncated
      ? new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, MAX_BODY_BYTES))
      : body,
    bodyAvailability: message.body === undefined
      ? "missing"
      : truncated
        ? "truncated"
        : "available",
    source: {
      kind: "synthetic",
      label: "Synthetic inbox",
      reference: `synthetic-message-${encodeURIComponent(message.id)}`,
    },
  };
}

// Future adapter to a real provider starts here.
export function createMockEmailReader(options: MockEmailReaderOptions = {}): ReadOnlyEmailReader {
  const now = options.now ?? Date.now;
  const configured = options.messages ?? EMAIL_FIXTURE_MESSAGES;
  return {
    async readRecentInbox(request) {
      if (!validWindow(request)) return result("unavailable", request, now);
      if (request.signal.aborted) {
        throw request.signal.reason instanceof Error
          ? request.signal.reason
          : new Error("Email read cancelled.");
      }
      if (options.status === "unavailable") {
        return result(options.status, request, now);
      }

      const since = Date.parse(request.since);
      const until = Date.parse(request.until);
      const candidates = configured.flatMap((message) => {
        const receivedAt = Date.parse(message.receivedAt);
        if (
          message.inbox === false ||
          message.draft ||
          !Number.isFinite(receivedAt) ||
          receivedAt < since ||
          receivedAt >= until
        ) return [];
        return [{ message, receivedAt }];
      });
      candidates.sort((left, right) =>
        right.receivedAt - left.receivedAt || left.message.id.localeCompare(right.message.id),
      );
      const messages = candidates.slice(0, 5).map(({ message, receivedAt }) =>
        evidenceMessage(message, receivedAt),
      );
      if (options.status === "partial") {
        return messages.length
          ? result("partial", request, now, messages, "incomplete")
          : result("unavailable", request, now);
      }
      return result(messages.length ? "ok" : "empty", request, now, messages);
    },
  };
}
