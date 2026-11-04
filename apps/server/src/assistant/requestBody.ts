import type { ConversationMessage } from "@sodalis/assistant";

/** Request parsing shared by the assistant turn and workflow routes. */

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_MESSAGES = 13;
export const MAX_MESSAGE_LENGTH = 12_000;
export const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class BodyLimitError extends Error {}

export async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new BodyLimitError("Assistant request exceeds the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readMessages(value: unknown): ConversationMessage[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MESSAGES) {
    return undefined;
  }
  const messages: ConversationMessage[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > MAX_MESSAGE_LENGTH
    ) {
      return undefined;
    }
    messages.push({ role: item.role, content: item.content });
  }
  if (messages.at(-1)?.role !== "user") return undefined;
  return messages;
}
