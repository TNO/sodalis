import { createHmac } from "node:crypto";
import { readBoundedResponseBody } from "./boundedResponseBody.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const WINDOW_MS = 7 * DAY_MS;
const MAX_PAGES = 2;
const PAGE_SIZE = 50;
const MAX_CANDIDATES = MAX_PAGES * PAGE_SIZE;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_BODY_BYTES = 8_192;
const READ_TIMEOUT_MS = 15_000;
const GRAPH_ORIGIN = "https://graph.microsoft.com";
const GRAPH_PATH = "/v1.0/me/mailFolders/inbox/messages";
const GMAIL_ORIGIN = "https://gmail.googleapis.com";
const GMAIL_PATH = "/gmail/v1/users/me/messages";

export type EmailProvider = "graph" | "gmail";
export type EmailReaderProvider = EmailProvider | "mock";
export type EmailReadStatus = "ok" | "empty" | "unauthorized" | "unavailable" | "partial";

export interface EmailConnection {
  readonly handle: string;
  readonly provider: EmailReaderProvider;
  readonly accountLabel: string;
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly sourceKey: string;
  readonly signal?: AbortSignal;
}

export interface EmailReaderRequest {
  readonly connectionHandle: string;
  readonly since: string;
  readonly until: string;
  readonly limit: 5;
  readonly signal: AbortSignal;
}

export interface EmailEvidenceMessage {
  readonly provider: EmailReaderProvider;
  readonly accountLabel: string;
  readonly sender: { readonly name: string; readonly address: string };
  readonly subject: string;
  readonly receivedAt: string;
  readonly body: string;
  readonly bodyAvailability: "available" | "missing" | "truncated";
  readonly source: { readonly reference: string };
}

export interface EmailReadResult {
  readonly status: EmailReadStatus;
  readonly provider?: EmailReaderProvider;
  readonly accountLabel?: string;
  readonly window: { readonly since: string; readonly until: string };
  readonly checkedAt: string;
  readonly coverage: "complete" | "incomplete";
  readonly messages: readonly EmailEvidenceMessage[];
}

export interface ReadOnlyEmailReader {
  readRecentInbox(request: EmailReaderRequest): Promise<EmailReadResult>;
}

export interface EmailHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type EmailHttpTransport = (
  url: string,
  init?: RequestInit,
) => Promise<EmailHttpResponse>;

export type ResolveEmailConnection = (
  handle: string,
) => Promise<EmailConnection | undefined>;

export interface EmailReaderAdapterOptions {
  readonly transport?: EmailHttpTransport;
  readonly resolveConnection: ResolveEmailConnection;
  readonly now?: () => number;
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
  readonly status?: EmailReadStatus;
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

interface Candidate {
  readonly id: string;
  readonly receivedAt: number;
  readonly senderName?: string;
  readonly senderAddress?: string;
  readonly subject?: string;
  readonly body?: string;
  readonly bodyMissing?: boolean;
  readonly bodyTruncated?: boolean;
}

interface ProviderPage {
  readonly candidates: readonly Candidate[];
  readonly next?: string;
  readonly malformed?: boolean;
}

class ProviderReadError extends Error {
  constructor(readonly status: "unauthorized" | "unavailable") {
    super(status);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Email read cancelled.");
}

function withTimeout(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(READ_TIMEOUT_MS)]);
}

async function defaultTransport(url: string, init?: RequestInit): Promise<EmailHttpResponse> {
  const response = await fetch(url, { ...init, redirect: "error" });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await readBoundedResponseBody(response, MAX_RESPONSE_BYTES),
  };
}

async function getJson(
  transport: EmailHttpTransport,
  url: string,
  token: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  let response: EmailHttpResponse;
  try {
    response = await transport(url, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal,
      redirect: "error",
    });
  } catch (error) {
    if (signal.aborted) throw abortError(signal);
    if (error instanceof ProviderReadError) throw error;
    throw new ProviderReadError("unavailable");
  }
  if (new TextEncoder().encode(response.body).byteLength > MAX_RESPONSE_BYTES) {
    throw new ProviderReadError("unavailable");
  }
  if (response.status === 401 || response.status === 403) throw new ProviderReadError("unauthorized");
  if (response.status < 200 || response.status >= 300) throw new ProviderReadError("unavailable");
  let value: unknown;
  try {
    value = JSON.parse(response.body);
  } catch {
    throw new ProviderReadError("unavailable");
  }
  if (!isRecord(value)) throw new ProviderReadError("unavailable");
  return value;
}

function isAllowedContinuation(value: string, origin: string, path: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === origin && url.pathname === path && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function parseIso(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

function normalizeHeader(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function boundBody(value: string | undefined): Pick<Candidate, "body" | "bodyMissing" | "bodyTruncated"> {
  if (value === undefined || !value.trim()) return { bodyMissing: true };
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= MAX_BODY_BYTES) return { body: value };
  const bounded = bytes.slice(0, MAX_BODY_BYTES);
  return {
    body: new TextDecoder("utf-8", { fatal: false }).decode(bounded),
    bodyTruncated: true,
  };
}

function sourceReference(connection: EmailConnection, id: string): string {
  return createHmac("sha256", connection.sourceKey).update(`${connection.handle}\0${connection.provider}\0${id}`).digest("base64url");
}

function normalizedMessage(connection: EmailConnection, candidate: Candidate): EmailEvidenceMessage {
  const bounded = boundBody(candidate.body);
  return {
    provider: connection.provider,
    accountLabel: connection.accountLabel,
    sender: {
      name: normalizeHeader(candidate.senderName) ?? "Unknown",
      address: normalizeHeader(candidate.senderAddress) ?? "Unknown",
    },
    subject: normalizeHeader(candidate.subject) ?? "Subject unavailable",
    receivedAt: new Date(candidate.receivedAt).toISOString(),
    body: bounded.body ?? "",
    bodyAvailability: candidate.bodyMissing
      ? "missing"
      : candidate.bodyTruncated || bounded.bodyTruncated
        ? "truncated"
        : "available",
    source: { reference: sourceReference(connection, candidate.id) },
  };
}

function result(
  status: EmailReadStatus,
  since: string,
  until: string,
  now: () => number,
  fields: Partial<Pick<EmailReadResult, "provider" | "accountLabel" | "coverage" | "messages">> = {},
): EmailReadResult {
  return {
    status,
    window: { since, until },
    checkedAt: new Date(now()).toISOString(),
    coverage: fields.coverage ?? (status === "empty" || status === "ok" ? "complete" : "incomplete"),
    messages: fields.messages ?? [],
    ...(fields.provider ? { provider: fields.provider } : {}),
    ...(fields.accountLabel ? { accountLabel: fields.accountLabel } : {}),
  };
}

function eligible(candidate: Candidate, since: number, until: number): boolean {
  return candidate.receivedAt >= since && candidate.receivedAt < until;
}

function sortCandidates(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id));
}

function hasExpired(connection: EmailConnection, now: () => number): boolean {
  return !connection.accessToken || !Number.isFinite(connection.expiresAt) || connection.expiresAt <= now();
}

function candidateFromGraph(value: unknown): Candidate | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  const receivedAt = parseIso(value.receivedDateTime);
  if (receivedAt === undefined) return undefined;
  if (value.isDraft === true) return undefined;
  const from = isRecord(value.from) && isRecord(value.from.emailAddress) ? value.from.emailAddress : undefined;
  return {
    id: value.id,
    receivedAt,
    ...(from ? { senderName: normalizeHeader(from.name), senderAddress: normalizeHeader(from.address) } : {}),
    ...(normalizeHeader(value.subject) ? { subject: normalizeHeader(value.subject) } : {}),
  };
}

function header(headers: unknown, name: string): string | undefined {
  if (!Array.isArray(headers)) return undefined;
  const field = headers.find((item) =>
    isRecord(item) && typeof item.name === "string" && item.name.toLowerCase() === name.toLowerCase(),
  );
  return isRecord(field) ? normalizeHeader(field.value) : undefined;
}

function parseFrom(value: string | undefined): { name?: string; address?: string } {
  if (!value) return {};
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value);
  if (match) return { name: match[1]!.replace(/^"|"$/g, "") || undefined, address: match[2]!.trim() };
  return value.includes("@") ? { address: value.trim() } : { name: value.trim() };
}

function candidateFromGmail(value: unknown): Candidate | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  const receivedAt = typeof value.internalDate === "string" ? Number(value.internalDate) : NaN;
  if (!Number.isFinite(receivedAt) || !Array.isArray(value.labelIds) || !value.labelIds.includes("INBOX") ||
    value.labelIds.includes("SPAM") || value.labelIds.includes("TRASH") || value.labelIds.includes("DRAFT")) return undefined;
  const from = parseFrom(header(isRecord(value.payload) ? value.payload.headers : undefined, "From"));
  return {
    id: value.id,
    receivedAt,
    ...(from.name ? { senderName: from.name } : {}),
    ...(from.address ? { senderAddress: from.address } : {}),
    ...(header(isRecord(value.payload) ? value.payload.headers : undefined, "Subject")
      ? { subject: header(isRecord(value.payload) ? value.payload.headers : undefined, "Subject") }
      : {}),
  };
}

async function mapBounded<T, U>(
  values: readonly T[],
  concurrency: number,
  signal: AbortSignal,
  visit: (value: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      signal.throwIfAborted();
      const index = next++;
      if (index >= values.length) return;
      results[index] = await visit(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readProviderInbox(
  request: EmailReaderRequest,
  provider: EmailProvider,
  resolveConnection: ResolveEmailConnection,
  now: () => number,
  collect: (connection: EmailConnection, signal: AbortSignal, since: number, until: number) => Promise<{
    candidates: Candidate[];
    complete: boolean;
  }>,
  fetchBodies: (connection: EmailConnection, candidates: readonly Candidate[], signal: AbortSignal) => Promise<{
    candidates: Candidate[];
    failed: boolean;
  }>,
): Promise<EmailReadResult> {
  if (!validWindow(request)) return result("unavailable", request.since, request.until, now);
  const since = Date.parse(request.since);
  const until = Date.parse(request.until);
  let signal = withTimeout(request.signal);
  let connection: EmailConnection | undefined;
  let selected: Candidate[] = [];
  try {
    connection = await resolveConnection(request.connectionHandle);
    if (!connection || connection.provider !== provider || hasExpired(connection, now)) {
      return result("unauthorized", request.since, request.until, now, { provider });
    }
    if (connection.signal) signal = AbortSignal.any([signal, connection.signal]);
    const collected = await collect(connection, signal, since, until);
    selected = sortCandidates(collected.candidates).slice(0, 5);
    let bodies: { candidates: Candidate[]; failed: boolean };
    try {
      bodies = await fetchBodies(connection, selected, signal);
    } catch (error) {
      if (request.signal.aborted || connection.signal?.aborted) throw error;
      if (!signal.aborted) throw error;
      const messages = selected.map((candidate) =>
        normalizedMessage(connection!, { ...candidate, body: undefined, bodyMissing: true }),
      );
      return result(messages.length ? "partial" : "unavailable", request.since, request.until, now, {
        provider,
        accountLabel: connection.accountLabel,
        coverage: "incomplete",
        messages,
      });
    }
    const complete = collected.complete && !bodies.failed;
    const messages = bodies.candidates.map((candidate) => normalizedMessage(connection!, candidate));
    const status = !complete ? messages.length ? "partial" : "unavailable" : messages.length ? "ok" : "empty";
    return result(status, request.since, request.until, now, {
      provider,
      accountLabel: connection.accountLabel,
      coverage: complete ? "complete" : "incomplete",
      messages,
    });
  } catch (error) {
    if (request.signal.aborted || connection?.signal?.aborted) throw abortError(request.signal);
    if (signal.aborted) {
      return result("unavailable", request.since, request.until, now, { provider });
    }
    if (error instanceof ProviderReadError && error.status === "unauthorized") {
      return result("unauthorized", request.since, request.until, now, { provider });
    }
    return result("unavailable", request.since, request.until, now, { provider });
  }
}

export function createMockEmailReader(options: MockEmailReaderOptions = {}): ReadOnlyEmailReader {
  const now = options.now ?? Date.now;
  const configured = options.messages ?? EMAIL_FIXTURE_MESSAGES;
  return {
    async readRecentInbox(request) {
      if (!validWindow(request)) return result("unavailable", request.since, request.until, now);
      if (request.signal.aborted) throw abortError(request.signal);
      const since = Date.parse(request.since);
      const until = Date.parse(request.until);
      if (options.status === "unauthorized" || options.status === "unavailable") {
        return result(options.status, request.since, request.until, now, { provider: "mock" });
      }
      const candidates = configured
        .filter((message) => message.inbox !== false && !message.draft)
        .flatMap((message) => {
          const receivedAt = parseIso(message.receivedAt);
          if (receivedAt === undefined || receivedAt < since || receivedAt >= until) return [];
          return [{
            id: message.id,
            receivedAt,
            ...(message.senderName ? { senderName: message.senderName } : {}),
            ...(message.senderAddress ? { senderAddress: message.senderAddress } : {}),
            ...(message.subject ? { subject: message.subject } : {}),
            ...(message.body !== undefined ? { body: message.body } : {}),
          }];
        });
      const mockConnection: EmailConnection = {
        handle: request.connectionHandle,
        provider: "mock",
        accountLabel: "Synthetic inbox",
        accessToken: "mock",
        expiresAt: Number.MAX_SAFE_INTEGER,
        sourceKey: "sodalis deterministic synthetic email source key",
      };
      const messages = sortCandidates(candidates).slice(0, 5).map((candidate) => normalizedMessage(mockConnection, candidate));
      const status = options.status === "partial"
        ? messages.length ? "partial" : "unavailable"
        : messages.length ? "ok" : "empty";
      return result(status, request.since, request.until, now, {
        provider: "mock",
        accountLabel: mockConnection.accountLabel,
        coverage: options.status === "partial" ? "incomplete" : "complete",
        messages,
      });
    },
  };
}

export function createGraphEmailReader(options: EmailReaderAdapterOptions): ReadOnlyEmailReader {
  const transport = options.transport ?? defaultTransport;
  const now = options.now ?? Date.now;

  async function page(
    connection: EmailConnection,
    url: string,
    signal: AbortSignal,
  ): Promise<ProviderPage> {
    if (!isAllowedContinuation(url, GRAPH_ORIGIN, GRAPH_PATH)) throw new ProviderReadError("unavailable");
    const payload = await getJson(transport, url, connection.accessToken, signal);
    if (!Array.isArray(payload.value)) throw new ProviderReadError("unavailable");
    const candidates = payload.value.flatMap((item) => {
      const candidate = candidateFromGraph(item);
      return candidate ? [candidate] : [];
    });
    const next = payload["@odata.nextLink"];
    if (next !== undefined && typeof next !== "string") throw new ProviderReadError("unavailable");
    const malformed = payload.value.some((item) =>
      !candidateFromGraph(item) && !(isRecord(item) && item.isDraft === true),
    );
    return {
      candidates: candidates.slice(0, PAGE_SIZE),
      ...(typeof next === "string" ? { next } : {}),
      ...(malformed || payload.value.length > PAGE_SIZE ? { malformed: true } : {}),
    };
  }

  return {
    readRecentInbox(request) {
      return readProviderInbox(
        request,
        "graph",
        options.resolveConnection,
        now,
        async (connection, signal, since, until) => {
          const params = new URLSearchParams({
            "$filter": `receivedDateTime ge ${new Date(since).toISOString()} and receivedDateTime lt ${new Date(until).toISOString()} and isDraft eq false`,
            "$orderby": "receivedDateTime desc",
            "$top": String(PAGE_SIZE),
            "$select": "id,receivedDateTime,from,subject,isDraft,parentFolderId",
          });
          let next: string | undefined = `${GRAPH_ORIGIN}${GRAPH_PATH}?${params}`;
          const candidates = new Map<string, Candidate>();
          let complete = false;
          let malformed = false;
          for (let pageIndex = 0; next && pageIndex < MAX_PAGES; pageIndex += 1) {
            let current: ProviderPage;
            try {
              current = await page(connection, next, signal);
            } catch (error) {
              if (error instanceof ProviderReadError && error.status === "unauthorized") throw error;
              if (request.signal.aborted || connection.signal?.aborted) throw error;
              if (candidates.size) return { candidates: [...candidates.values()], complete: false };
              throw error;
            }
            malformed ||= current.malformed === true;
            for (const candidate of current.candidates) {
              if (eligible(candidate, since, until)) candidates.set(candidate.id, candidate);
            }
            const ordered = sortCandidates([...candidates.values()]);
            const lastConsumed = current.candidates.at(-1);
            const fifth = ordered[4];
            if (fifth && lastConsumed && lastConsumed.receivedAt < fifth.receivedAt) {
              complete = !malformed;
              break;
            }
            next = current.next;
            if (!next) complete = !malformed;
            if (pageIndex === MAX_PAGES - 1 && next) complete = false;
          }
          return { candidates: [...candidates.values()], complete: complete && !malformed };
        },
        async (connection, candidates, signal) => {
          let failed = false;
          const results = await mapBounded(candidates, 4, signal, async (candidate) => {
            const url = new URL(`${GRAPH_PATH}/${encodeURIComponent(candidate.id)}`, GRAPH_ORIGIN);
            url.searchParams.set("$select", "id,body");
            try {
              const payload = await getJson(transport, url.toString(), connection.accessToken, signal);
              const body = isRecord(payload.body) && typeof payload.body.content === "string"
                ? (String(payload.body.contentType).toLowerCase() === "html" ? decodeHtml(payload.body.content) : payload.body.content)
                : undefined;
              const normalized = boundBody(body);
              failed ||= normalized.bodyMissing === true;
              return { ...candidate, ...normalized };
            } catch (error) {
              if (error instanceof ProviderReadError && error.status === "unauthorized") throw error;
              failed = true;
              return { ...candidate, bodyMissing: true };
            }
          });
          return { candidates: results, failed };
        },
      );
    },
  };
}

function gmailBody(payload: unknown): string | undefined {
  const find = (value: unknown, mimeType: "text/plain" | "text/html"): string | undefined => {
    if (!isRecord(value) || (typeof value.filename === "string" && value.filename)) return undefined;
    if (
      value.mimeType === mimeType &&
      isRecord(value.body) &&
      typeof value.body.data === "string"
    ) {
      return Buffer.from(value.body.data, "base64url").toString("utf8");
    }
    if (!Array.isArray(value.parts)) return undefined;
    for (const part of value.parts) {
      const body = find(part, mimeType);
      if (body !== undefined) return body;
    }
    return undefined;
  };
  const plain = find(payload, "text/plain");
  if (plain !== undefined) return plain;
  const html = find(payload, "text/html");
  return html === undefined ? undefined : decodeHtml(html);
}

export function createGmailEmailReader(options: EmailReaderAdapterOptions): ReadOnlyEmailReader {
  const transport = options.transport ?? defaultTransport;
  const now = options.now ?? Date.now;

  async function page(
    connection: EmailConnection,
    url: string,
    signal: AbortSignal,
  ): Promise<{ ids: string[]; next?: string; malformed?: boolean }> {
    if (!isAllowedContinuation(url, GMAIL_ORIGIN, GMAIL_PATH)) throw new ProviderReadError("unavailable");
    const payload = await getJson(transport, url, connection.accessToken, signal);
    if (payload.messages !== undefined && !Array.isArray(payload.messages)) throw new ProviderReadError("unavailable");
    const ids = (payload.messages as unknown[] | undefined ?? []).flatMap((item) =>
      isRecord(item) && typeof item.id === "string" ? [item.id] : [],
    );
    const next = payload.nextPageToken;
    if (next !== undefined && typeof next !== "string") throw new ProviderReadError("unavailable");
    return {
      ids,
      ...(typeof next === "string" ? { next } : {}),
      ...(Array.isArray(payload.messages) &&
      payload.messages.some((item) => !isRecord(item) || typeof item.id !== "string") ? { malformed: true } : {}),
    };
  }

  return {
    readRecentInbox(request) {
      return readProviderInbox(
        request,
        "gmail",
        options.resolveConnection,
        now,
        async (connection, signal, since, until) => {
          const after = Math.floor(since / 1_000) - 1;
          const before = Math.ceil(until / 1_000) + 1;
          const candidates: Candidate[] = [];
          const seen = new Set<string>();
          let token: string | undefined;
          let complete = false;
          let malformed = false;
          for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
            const url = new URL(GMAIL_PATH, GMAIL_ORIGIN);
            url.searchParams.set("labelIds", "INBOX");
            url.searchParams.set("includeSpamTrash", "false");
            url.searchParams.set("maxResults", String(PAGE_SIZE));
            url.searchParams.set("q", `after:${after} before:${before}`);
            if (token) url.searchParams.set("pageToken", token);
            let current: Awaited<ReturnType<typeof page>>;
            try {
              current = await page(connection, url.toString(), signal);
            } catch (error) {
              if (error instanceof ProviderReadError && error.status === "unauthorized") throw error;
              if (request.signal.aborted || connection.signal?.aborted) throw error;
              if (candidates.length) return { candidates, complete: false };
              throw error;
            }
            malformed ||= current.malformed === true;
            const uniqueIds = [...new Set(current.ids)].filter((id) => !seen.has(id));
            const remaining = MAX_CANDIDATES - seen.size;
            if (uniqueIds.length > PAGE_SIZE || uniqueIds.length > remaining) malformed = true;
            const ids = uniqueIds.slice(0, Math.min(PAGE_SIZE, remaining));
            ids.forEach((id) => seen.add(id));
            const metadata = await mapBounded(ids, 4, signal, async (id) => {
              const metadataUrl = new URL(`${GMAIL_PATH}/${encodeURIComponent(id)}`, GMAIL_ORIGIN);
              metadataUrl.searchParams.set("format", "metadata");
              metadataUrl.searchParams.set("metadataHeaders", "From");
              metadataUrl.searchParams.append("metadataHeaders", "Subject");
              try {
                return candidateFromGmail(await getJson(transport, metadataUrl.toString(), connection.accessToken, signal));
              } catch (error) {
                if (error instanceof ProviderReadError && error.status === "unauthorized") throw error;
                malformed = true;
                return undefined;
              }
            });
            if (metadata.some((item) => item === undefined)) malformed = true;
            candidates.push(...metadata.filter((item): item is Candidate => item !== undefined)
              .filter((candidate) => eligible(candidate, since, until)));
            token = current.next;
            if (!token) {
              complete = !malformed;
              break;
            }
            if (seen.size >= MAX_CANDIDATES) complete = false;
          }
          if (token) complete = false;
          return { candidates, complete: complete && !malformed };
        },
        async (connection, candidates, signal) => {
          let failed = false;
          const results = await mapBounded(candidates, 4, signal, async (candidate) => {
            const url = new URL(`${GMAIL_PATH}/${encodeURIComponent(candidate.id)}`, GMAIL_ORIGIN);
            url.searchParams.set("format", "full");
            try {
              const payload = await getJson(transport, url.toString(), connection.accessToken, signal);
              const current = candidateFromGmail(payload);
              const body = gmailBody(payload.payload);
              if (!current) {
                failed = true;
                return { ...candidate, bodyMissing: true };
              }
              const normalized = boundBody(body);
              failed ||= normalized.bodyMissing === true;
              return { ...current, ...normalized };
            } catch (error) {
              if (error instanceof ProviderReadError && error.status === "unauthorized") throw error;
              failed = true;
              return { ...candidate, bodyMissing: true };
            }
          });
          return { candidates: results, failed };
        },
      );
    },
  };
}
