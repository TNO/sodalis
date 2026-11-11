import { createHash } from "node:crypto";

export const MAX_EMAIL_PAGE_SIZE = 100;
export const MAX_EMAIL_BODY_BYTES = 64 * 1024;
const DEFAULT_PAGE_SIZE = 20;

export type EmailContainer = "inbox" | "all_mail";
export type MockEmailFolder = "inbox" | "archive" | "sent" | "drafts" | "spam" | "trash" | "deleted";
export type EmailSourceKind = "synthetic" | "provider";
export type EmailSentAtProvenance = "provider" | "sender_supplied" | "synthetic" | "missing";
export type EmailReadStatus =
  | "ok"
  | "empty"
  | "partial"
  | "unavailable"
  | "unsupported"
  | "invalid_request"
  | "cancelled";

declare const emailSourceLabelBrand: unique symbol;
export type SafeEmailSourceLabel = string & { readonly [emailSourceLabelBrand]: true };

/** Host-selected display evidence with no provider identifiers or endpoint URLs. */
export interface EmailSource {
  readonly kind: EmailSourceKind;
  readonly label: SafeEmailSourceLabel;
  readonly container: EmailContainer;
}

export function createEmailSource(
  kind: EmailSourceKind,
  label: string,
  container: EmailContainer,
): EmailSource {
  const safeLabel = label.trim();
  if (
    (kind !== "synthetic" && kind !== "provider") ||
    (container !== "inbox" && container !== "all_mail") ||
    !/^(?=.*\p{L})[\p{L}\p{N} _'-]{1,80}$/u.test(safeLabel)
  ) {
    throw new Error("Email source must use a safe display label and supported container.");
  }
  return { kind, label: safeLabel as SafeEmailSourceLabel, container };
}

export interface EmailTimeWindow {
  readonly from: string;
  readonly to: string;
}

export interface EmailListFilters {
  readonly container?: EmailContainer;
  readonly sender?: string;
  readonly subject?: string;
  readonly unread?: boolean;
  readonly sentAt?: EmailTimeWindow;
  readonly receivedAt?: EmailTimeWindow;
}

export interface EmailSort {
  readonly field: "sentAt" | "receivedAt";
  readonly direction: "asc" | "desc";
}

export interface EmailListRequest {
  readonly filters?: EmailListFilters;
  readonly sort?: EmailSort;
  readonly pageSize?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export type EmailSentAt =
  | {
      readonly availability: "available";
      readonly provenance: Exclude<EmailSentAtProvenance, "missing">;
      readonly value: string;
    }
  | {
      readonly availability: "missing";
      readonly provenance: "missing";
    };

export interface EmailMessageMetadata {
  readonly messageRef: string;
  readonly sender: { readonly name: string; readonly address: string };
  readonly subject: string;
  readonly sentAt: EmailSentAt;
  readonly receivedAt?: string;
  readonly unread: boolean;
  readonly source: EmailSource;
}

export interface EmailListResult {
  readonly status: EmailReadStatus;
  readonly sourceLabel: SafeEmailSourceLabel;
  readonly container: EmailContainer;
  readonly coverage: "complete" | "continuation" | "incomplete";
  readonly messages: readonly EmailMessageMetadata[];
  readonly nextCursor?: string;
  readonly reason?: string;
}

export interface EmailContentResult {
  readonly status: EmailReadStatus;
  readonly sourceLabel?: SafeEmailSourceLabel;
  readonly source?: EmailSource;
  readonly messageRef?: string;
  readonly text?: string;
  readonly availability?: "available" | "missing" | "truncated";
  readonly truncated?: boolean;
  readonly reason?: string;
}

export interface EmailUnreadCountResult {
  readonly status: EmailReadStatus;
  readonly sourceLabel?: SafeEmailSourceLabel;
  readonly container?: EmailContainer;
  readonly count?: number;
  readonly accuracy?: "exact" | "estimated";
  readonly reason?: string;
}

export interface ReadOnlyEmailReader {
  listMessages(request?: EmailListRequest): Promise<EmailListResult>;
  getMessageContent(messageRef: string, signal?: AbortSignal): Promise<EmailContentResult>;
  countUnread(container?: EmailContainer, signal?: AbortSignal): Promise<EmailUnreadCountResult>;
}

export interface MockEmail {
  readonly id: string;
  readonly receivedAt?: string;
  readonly sentAt?: string;
  readonly senderName?: string;
  readonly senderAddress?: string;
  readonly subject?: string;
  readonly body?: string;
  readonly unread?: boolean;
  readonly folder?: MockEmailFolder;
  /** Legacy fixture fields remain accepted so existing callers need not reshape fixture data. */
  readonly inbox?: boolean;
  readonly draft?: boolean;
}

export interface MockEmailReaderOptions {
  readonly messages?: readonly MockEmail[];
  readonly status?: "unavailable";
}

export const EMAIL_FIXTURE_MESSAGES: readonly MockEmail[] = [
  { id: "M01", receivedAt: "2026-11-05T11:00:00.000Z", sentAt: "2026-11-05T10:52:00.000Z", senderName: "Ana", senderAddress: "ana@example.test", subject: "Visit", body: "I will visit Friday at 14:00.", unread: true },
  { id: "M02", receivedAt: "2026-11-04T15:00:00.000Z", sentAt: "2026-11-04T14:50:00.000Z", senderName: "Bo", senderAddress: "bo@example.test", subject: "Delivery", body: "The parcel arrives Monday.", unread: false },
  { id: "M03", receivedAt: "2026-11-03T09:00:00.000Z", sentAt: "2026-11-03T08:40:00.000Z", senderName: "Cy", senderAddress: "cy@example.test", subject: "Library", body: "Your book is ready.", unread: true },
  { id: "M04", receivedAt: "2026-11-02T10:00:00.000Z", sentAt: "2026-11-02T09:45:00.000Z", senderName: "Dee", senderAddress: "dee@example.test", subject: "Lunch", body: "Lunch is at noon.", unread: false },
  { id: "M05", receivedAt: "2026-11-02T10:00:00.000Z", sentAt: "2026-11-02T09:40:00.000Z", senderName: "Eli", senderAddress: "eli@example.test", subject: "Walk", body: "Meet at the park gate.", unread: true },
  { id: "M06", receivedAt: "2026-11-01T14:00:00.000Z", sentAt: "2026-11-01T13:50:00.000Z", senderName: "Fay", senderAddress: "fay@example.test", subject: "Receipt", body: "Payment received.", unread: false },
  { id: "M07", receivedAt: "2026-10-29T12:00:00.000Z", sentAt: "2026-10-29T11:50:00.000Z", senderName: "Gus", senderAddress: "gus@example.test", subject: "Boundary", body: "Start of window.", unread: true },
  { id: "M08", receivedAt: "2026-10-29T11:59:59.000Z", sentAt: "2026-10-29T11:40:00.000Z", senderName: "Synthetic sender", senderAddress: "old@example.test", subject: "Old", body: "Outside the example window.", unread: true },
  { id: "M09", receivedAt: "2026-11-05T12:00:00.000Z", sentAt: "2026-11-05T11:59:00.000Z", senderName: "Synthetic sender", senderAddress: "future@example.test", subject: "Future edge", body: "Outside the example window.", unread: true },
  { id: "M10", receivedAt: "2026-11-05T11:30:00.000Z", sentAt: "2026-11-05T11:00:00.000Z", senderName: "Synthetic sender", senderAddress: "sent@example.test", subject: "Sent", body: "Sent only.", unread: false, folder: "sent" },
  { id: "M11", receivedAt: "2026-11-05T11:30:00.000Z", senderName: "Synthetic sender", senderAddress: "draft@example.test", subject: "Draft", body: "Draft.", unread: true, folder: "drafts" },
  { id: "M12", receivedAt: "2026-11-05T11:30:00.000Z", senderName: "Synthetic sender", senderAddress: "spam@example.test", subject: "Spam", body: "Spam.", unread: true, folder: "spam" },
  { id: "M13", receivedAt: "2026-11-05T11:30:00.000Z", senderName: "Synthetic sender", senderAddress: "trash@example.test", subject: "Trash", body: "Trash.", unread: false, folder: "trash" },
  { id: "M14", receivedAt: "2026-11-04T12:00:00.000Z", sentAt: "2026-11-04T11:30:00.000Z", senderName: "Synthetic sender", senderAddress: "archive@example.test", subject: "Archived", body: "Archived message.", unread: true, folder: "archive" },
];

function isUtcTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) return false;
  return new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
}

function isTimeWindow(value: unknown): value is EmailTimeWindow {
  if (!value || typeof value !== "object") return false;
  const window = value as Partial<EmailTimeWindow>;
  return isUtcTimestamp(window.from) &&
    isUtcTimestamp(window.to) &&
    Date.parse(window.from) < Date.parse(window.to);
}

function folderOf(message: MockEmail): MockEmailFolder {
  if (message.folder) return message.folder;
  if (message.draft) return "drafts";
  return message.inbox === false ? "sent" : "inbox";
}

function normalizeText(value: string | undefined, fallback: string): string {
  return value?.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim() || fallback;
}

function plainText(value: string): string {
  const withoutActiveContent = value
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*br\b[^>]*\/?>/gi, " ")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const decoded = withoutActiveContent.replace(
    /&(#(?:x[\da-f]+|\d+)|amp|nbsp|lt|gt|quot|apos);/gi,
    (_entity, value: string) => {
      if (value[0] === "#") {
        const code = value[1]?.toLowerCase() === "x"
          ? Number.parseInt(value.slice(2), 16)
          : Number.parseInt(value.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : " ";
      }
      return ({
        amp: "&",
        nbsp: " ",
        lt: "<",
        gt: ">",
        quot: "\"",
        apos: "'",
      } as Record<string, string>)[value.toLowerCase()] ?? " ";
    },
  );
  return decoded
    .replace(/\b(?:https?:\/\/|www\.)[^\s<]+/gi, "[link omitted]")
    .replace(/\bmailto:[^\s<]+/gi, "[link omitted]")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  let bytes = 0;
  let text = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const size = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (bytes + size > maxBytes) return { text, truncated: true };
    bytes += size;
    text += character;
  }
  return { text, truncated: false };
}

function mockSource(container: EmailContainer): EmailSource {
  return createEmailSource(
    "synthetic",
    container === "inbox" ? "Synthetic inbox" : "Synthetic all mail",
    container,
  );
}
const INVALID_RESULT_SOURCE_LABEL = mockSource("inbox").label;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function opaqueToken(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function validFilters(filters: unknown): filters is EmailListFilters {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return false;
  const value = filters as Record<string, unknown>;
  const allowed = new Set(["container", "sender", "subject", "unread", "sentAt", "receivedAt"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (value.container !== undefined && value.container !== "inbox" && value.container !== "all_mail") return true;
  if (value.sender !== undefined && (typeof value.sender !== "string" || !value.sender.trim() || value.sender.length > 200)) return false;
  if (value.subject !== undefined && (typeof value.subject !== "string" || !value.subject.trim() || value.subject.length > 500)) return false;
  if (value.unread !== undefined && typeof value.unread !== "boolean") return false;
  if (value.sentAt !== undefined && !isTimeWindow(value.sentAt)) return false;
  if (value.receivedAt !== undefined && !isTimeWindow(value.receivedAt)) return false;
  return true;
}

function hasUnsupportedContainer(filters: EmailListFilters | undefined): boolean {
  const container: unknown = filters?.container;
  return container !== undefined && container !== "inbox" && container !== "all_mail";
}

function eligibleInContainer(message: MockEmail, container: EmailContainer): boolean {
  const folder = folderOf(message);
  if (container === "inbox") return folder === "inbox";
  return folder === "inbox" || folder === "archive" || folder === "sent";
}

function matchesWindow(timestamp: string | undefined, window: EmailTimeWindow | undefined): boolean {
  if (!window) return true;
  if (!timestamp || !isUtcTimestamp(timestamp)) return false;
  const value = Date.parse(timestamp);
  return value >= Date.parse(window.from) && value < Date.parse(window.to);
}

function emailSourceMessage(
  message: MockEmail,
  messageRef: string,
  source: EmailSource,
): EmailMessageMetadata {
  const sentAt = isUtcTimestamp(message.sentAt)
    ? { availability: "available" as const, provenance: "synthetic" as const, value: new Date(message.sentAt).toISOString() }
    : { availability: "missing" as const, provenance: "missing" as const };
  const receivedAt = isUtcTimestamp(message.receivedAt)
    ? new Date(message.receivedAt).toISOString()
    : undefined;
  return {
    messageRef,
    sender: {
      name: normalizeText(message.senderName, "Unknown"),
      address: normalizeText(message.senderAddress, "Unknown"),
    },
    subject: normalizeText(message.subject, "Subject unavailable"),
    sentAt,
    ...(receivedAt ? { receivedAt } : {}),
    unread: message.unread ?? false,
    source,
  };
}

export function createMockEmailReader(options: MockEmailReaderOptions = {}): ReadOnlyEmailReader {
  const messages = options.messages ?? EMAIL_FIXTURE_MESSAGES;
  const sourceId = opaqueToken(canonical(messages));
  const messageRefs = new Map<string, { readonly message: MockEmail; readonly source: EmailSource }>();
  const refByMessage = new Map<string, string>();
  const cursorPositions = new Map<string, { readonly query: string; readonly offset: number }>();

  const messageRef = (message: MockEmail, source: EmailSource): string => {
    const key = `${source.container}:${message.id}`;
    let ref = refByMessage.get(key);
    if (!ref) {
      ref = `mail.${sourceId}.${opaqueToken(`${source.container}:${message.id}`)}`;
      refByMessage.set(key, ref);
      messageRefs.set(ref, { message, source });
    }
    return ref;
  };

  const aborted = (signal: AbortSignal | undefined) => Boolean(signal?.aborted);

  return {
    async listMessages(request = {}) {
      const filters = request.filters === undefined ? {} : request.filters;
      if (!validFilters(filters)) {
        return { status: "invalid_request", sourceLabel: INVALID_RESULT_SOURCE_LABEL, container: "inbox", coverage: "incomplete", messages: [], reason: "invalid_filters" };
      }
      if (hasUnsupportedContainer(filters)) {
        return { status: "unsupported", sourceLabel: INVALID_RESULT_SOURCE_LABEL, container: "inbox", coverage: "incomplete", messages: [], reason: "unsupported_container" };
      }
      if (
        request.sort !== undefined &&
        (!request.sort || !["sentAt", "receivedAt"].includes(request.sort.field) ||
          !["asc", "desc"].includes(request.sort.direction))
      ) {
        return { status: "invalid_request", sourceLabel: INVALID_RESULT_SOURCE_LABEL, container: "inbox", coverage: "incomplete", messages: [], reason: "invalid_sort" };
      }
      const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE;
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_EMAIL_PAGE_SIZE) {
        return { status: "invalid_request", sourceLabel: INVALID_RESULT_SOURCE_LABEL, container: "inbox", coverage: "incomplete", messages: [], reason: "invalid_page_size" };
      }
      if (request.cursor !== undefined && (typeof request.cursor !== "string" || !request.cursor.length || request.cursor.length > 500)) {
        return { status: "invalid_request", sourceLabel: INVALID_RESULT_SOURCE_LABEL, container: "inbox", coverage: "incomplete", messages: [], reason: "invalid_cursor" };
      }

      const container = filters.container ?? "inbox";
      const source = mockSource(container);
      const result = (
        status: EmailReadStatus,
        coverage: EmailListResult["coverage"],
        items: readonly EmailMessageMetadata[] = [],
        next?: string,
        reason?: string,
      ): EmailListResult => ({
        status,
        sourceLabel: source.label,
        container,
        coverage,
        messages: items,
        ...(next ? { nextCursor: next } : {}),
        ...(reason ? { reason } : {}),
      });

      if (aborted(request.signal)) return result("cancelled", "incomplete", [], undefined, "cancelled");
      if (options.status === "unavailable") return result("unavailable", "incomplete", [], undefined, "source_unavailable");

      const sort = request.sort ?? { field: "receivedAt" as const, direction: "desc" as const };
      const normalizedFilters = {
        ...filters,
        container,
        ...(filters.sender !== undefined ? { sender: filters.sender.trim().toLocaleLowerCase() } : {}),
        ...(filters.subject !== undefined ? { subject: filters.subject.trim().toLocaleLowerCase() } : {}),
      };
      const query = canonical({ filters: normalizedFilters, sort, pageSize });
      let offset = 0;
      if (request.cursor) {
        const position = cursorPositions.get(request.cursor);
        if (!position || position.query !== query) {
          return result("invalid_request", "incomplete", [], undefined, "invalid_cursor");
        }
        offset = position.offset;
      }

      const candidates = messages
        .filter((message) => eligibleInContainer(message, container))
        .map((message) => ({ message, ref: messageRef(message, source) }))
        .filter(({ message }) => filters.sender === undefined ||
          `${message.senderName ?? ""} ${message.senderAddress ?? ""}`.toLocaleLowerCase().includes(filters.sender.trim().toLocaleLowerCase()))
        .filter(({ message }) => filters.subject === undefined ||
          (message.subject ?? "").toLocaleLowerCase().includes(filters.subject.trim().toLocaleLowerCase()))
        .filter(({ message }) => filters.unread === undefined || (message.unread ?? false) === filters.unread)
        .filter(({ message }) => matchesWindow(message.sentAt, filters.sentAt))
        .filter(({ message }) => matchesWindow(message.receivedAt, filters.receivedAt))
        .sort((left, right) => {
          const leftTimestamp = sort.field === "sentAt" ? left.message.sentAt : left.message.receivedAt;
          const rightTimestamp = sort.field === "sentAt" ? right.message.sentAt : right.message.receivedAt;
          const leftTime = leftTimestamp === undefined ? Number.NaN : Date.parse(leftTimestamp);
          const rightTime = rightTimestamp === undefined ? Number.NaN : Date.parse(rightTimestamp);
          const leftValid = Number.isFinite(leftTime);
          const rightValid = Number.isFinite(rightTime);
          if (leftValid !== rightValid) return leftValid ? -1 : 1;
          if (leftValid && rightValid && leftTime !== rightTime) {
            return (sort.direction === "desc" ? -1 : 1) * (leftTime - rightTime);
          }
          return left.ref.localeCompare(right.ref);
        });
      const page = candidates.slice(offset, offset + pageSize);
      const metadata = page.map(({ message, ref }) =>
        emailSourceMessage(message, ref, source),
      );
      const more = offset + page.length < candidates.length;
      if (!page.length) return result("empty", "complete");
      if (more) {
        const cursor = `cursor.${sourceId}.${opaqueToken(`${query}:${offset + page.length}`)}`;
        cursorPositions.set(cursor, { query, offset: offset + page.length });
        return result("partial", "continuation", metadata, cursor);
      }
      return result("ok", "complete", metadata);
    },

    async getMessageContent(ref, signal) {
      if (aborted(signal)) return { status: "cancelled", reason: "cancelled" };
      if (options.status === "unavailable") return { status: "unavailable", reason: "source_unavailable" };
      const entry = typeof ref === "string" ? messageRefs.get(ref) : undefined;
      if (!entry) return { status: "invalid_request", reason: "invalid_message_ref" };
      const body = entry.message.body;
      if (body === undefined) {
        return {
          status: "ok",
          messageRef: ref,
          sourceLabel: entry.source.label,
          source: entry.source,
          text: "",
          availability: "missing",
          truncated: false,
        };
      }
      const normalized = plainText(body);
      const clipped = truncateUtf8(normalized, MAX_EMAIL_BODY_BYTES);
      return {
        status: "ok",
        messageRef: ref,
        sourceLabel: entry.source.label,
        source: entry.source,
        text: clipped.text,
        availability: clipped.truncated ? "truncated" : "available",
        truncated: clipped.truncated,
      };
    },

    async countUnread(container = "inbox", signal) {
      if (aborted(signal)) return { status: "cancelled", reason: "cancelled" };
      if (container !== "inbox" && container !== "all_mail") {
        return { status: "unsupported", reason: "unsupported_container" };
      }
      if (options.status === "unavailable") return { status: "unavailable", reason: "source_unavailable" };
      const count = messages.filter((message) =>
        eligibleInContainer(message, container) &&
        (message.unread ?? false),
      ).length;
      return {
        status: "ok",
        sourceLabel: mockSource(container).label,
        container,
        count,
        accuracy: "exact",
      };
    },
  };
}
