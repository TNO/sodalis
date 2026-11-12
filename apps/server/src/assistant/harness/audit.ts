import { appendFile, chown, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export interface CompanionAuditEvent {
  readonly event: string;
  readonly workflowId: string;
  readonly sessionId: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly [key: string]: unknown;
}

export interface CompanionAuditSink {
  write(event: CompanionAuditEvent): void | Promise<void>;
}

const SECRET_KEY = /(?:password|passwd|secret|token|api[-_]?key|authorization|credential)/i;
const NON_TEXT_KEY = /(?:audio|recording|artifact|buffer|bytes|binary)/i;
const inlineSecret = /(["']?)([A-Za-z0-9_-]*(?:authorization|x-api-key|api[-_]?key|password|passwd|secret|token|credential)[A-Za-z0-9_-]*)\1(\s*[:=]\s*)(\[[^\]]*\]|"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi;
const MODEL_USAGE_FIELDS = new Set(["input", "output", "cacheRead", "cacheWrite", "totalTokens"]);

function redactString(value: string): string {
  return value
    .replace(/\bauthorization\b(\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, "authorization$1[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(inlineSecret, (_match: string, keyQuote: string, key: string, separator: string, credential: string) => {
      const valueQuote = credential[0] === '"' || credential[0] === "'" ? credential[0] : "";
      return `${keyQuote}${key}${keyQuote}${separator}${valueQuote}[REDACTED]${valueQuote}`;
    });
}

function redact(
  value: unknown,
  key = "",
  isModelUsageField = false,
  isModelUsageContainer = false,
): unknown {
  if (
    isModelUsageField &&
    MODEL_USAGE_FIELDS.has(key) &&
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return value;
  }
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (NON_TEXT_KEY.test(key)) return undefined;
  if (typeof value === "string") return redactString(value);
  if (value instanceof Uint8Array) return "[binary omitted]";
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const isAssistantMessage = key === "" && record.event === "assistant.message";
    return Object.fromEntries(
      Object.entries(value)
        .map(([childKey, child]) => [
          childKey,
          redact(
            child,
            childKey,
            isModelUsageContainer && MODEL_USAGE_FIELDS.has(childKey),
            isAssistantMessage && childKey === "usage",
          ),
        ] as const)
        .filter(([, child]) => child !== undefined),
    );
  }
  return value;
}

function transcriptLine(event: CompanionAuditEvent): string {
  const { event: kind, timestamp, workflowId, sessionId, correlationId, ...details } = event;
  const context = Object.entries(details)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  return `${timestamp} ${kind} workflow=${workflowId} session=${sessionId} correlation=${correlationId}${context ? ` ${context}` : ""}`;
}

/** Applies the storage/report sanitizer to one audit record. */
export function sanitizeCompanionAuditRecord(value: unknown): unknown {
  return redact(value);
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");

/** Appends each sanitized workflow record to a local JSONL and readable transcript. */
export class FileCompanionAuditWriter implements CompanionAuditSink {
  private readonly jsonlPath: string;
  private readonly transcriptPath: string;
  private pending: Promise<void> = Promise.resolve();

  constructor(directory = resolve(repositoryRoot, "logs")) {
    const prefix = `companion-audit-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`;
    this.jsonlPath = resolve(directory, `${prefix}.jsonl`);
    this.transcriptPath = resolve(directory, `${prefix}.txt`);
  }

  write(event: CompanionAuditEvent): Promise<void> {
    const safeEvent = sanitizeCompanionAuditRecord(event) as CompanionAuditEvent;
    const jsonLine = `${JSON.stringify(safeEvent)}\n`;
    const humanLine = `${transcriptLine(safeEvent)}\n`;
    const operation = this.pending.then(async () => {
      await mkdir(dirname(this.jsonlPath), { recursive: true, mode: 0o700 });
      await Promise.all([
        appendFile(this.jsonlPath, jsonLine, { encoding: "utf8", mode: 0o600 }),
        appendFile(this.transcriptPath, humanLine, { encoding: "utf8", mode: 0o600 }),
      ]);
      // Root containers must leave private bind-mounted files readable by the host owner.
      if (process.getuid?.() === 0) {
        const owner = await stat(dirname(this.jsonlPath));
        await Promise.all([
          chown(this.jsonlPath, owner.uid, owner.gid),
          chown(this.transcriptPath, owner.uid, owner.gid),
        ]);
      }
    });
    this.pending = operation.catch((error: unknown) => {
      console.error("Developer audit write failed:", error);
    });
    return this.pending;
  }

  async flush(): Promise<void> {
    await this.pending;
  }

  get paths(): { readonly jsonl: string; readonly transcript: string } {
    return { jsonl: this.jsonlPath, transcript: this.transcriptPath };
  }
}
