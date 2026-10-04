export const ASSISTANT_EXPRESSIONS = [
  "neutral",
  "warm",
  "happy",
  "concerned",
  "sad",
  "surprised",
  "reassuring",
] as const;

export type AssistantExpression = (typeof ASSISTANT_EXPRESSIONS)[number];

export const ASSISTANT_GESTURES = [
  "nod",
  "shake-head",
  "acknowledge",
  "none",
] as const;

export type AssistantGesture = (typeof ASSISTANT_GESTURES)[number];

export interface AssistantAffect {
  readonly expression: AssistantExpression;
  readonly valence: number;
  readonly arousal: number;
  readonly intensity: number;
}

export interface AssistantUtterance {
  readonly text: string;
  readonly affect: AssistantAffect;
  readonly gesture?: AssistantGesture;
  readonly interruptible: boolean;
}

const DEFAULT_TEXT = "I'm sorry, I couldn't prepare a response.";
const DEFAULT_AFFECT: AssistantAffect = {
  expression: "warm",
  valence: 0.2,
  arousal: 0.2,
  intensity: 0.25,
};
const MAX_UTTERANCE_LENGTH = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

function clampFinite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeAssistantUtterance(
  value: unknown,
  fallbackText?: string,
): AssistantUtterance {
  const record = isRecord(value) ? value : undefined;
  const candidateText =
    typeof record?.text === "string" && record.text.trim()
      ? record.text
      : fallbackText;
  const text = (candidateText?.trim() || DEFAULT_TEXT).slice(
    0,
    MAX_UTTERANCE_LENGTH,
  );
  const affect = isRecord(record?.affect) ? record.affect : undefined;
  const expression = isOneOf(affect?.expression, ASSISTANT_EXPRESSIONS)
    ? affect.expression
    : DEFAULT_AFFECT.expression;
  const gesture = isOneOf(record?.gesture, ASSISTANT_GESTURES)
    ? record.gesture
    : undefined;
  return {
    text,
    affect: {
      expression,
      valence: clampFinite(
        affect?.valence,
        DEFAULT_AFFECT.valence,
        -1,
        1,
      ),
      arousal: clampFinite(
        affect?.arousal,
        DEFAULT_AFFECT.arousal,
        0,
        1,
      ),
      intensity: clampFinite(
        affect?.intensity,
        DEFAULT_AFFECT.intensity,
        0,
        1,
      ),
    },
    ...(gesture && gesture !== "none" ? { gesture } : {}),
    interruptible:
      typeof record?.interruptible === "boolean"
        ? record.interruptible
        : true,
  };
}

export function extractAssistantUtteranceTextPrefix(response: string): string {
  const textProperty = /"text"\s*:\s*"/g;
  const match = textProperty.exec(response);
  if (!match) {
    const trimmed = response.trimStart();
    return trimmed.startsWith("{") ||
        trimmed.startsWith("[") ||
        trimmed.startsWith('"')
      ? ""
      : response;
  }

  let text = "";
  for (let index = textProperty.lastIndex; index < response.length; index += 1) {
    const character = response[index];
    if (character === '"') return text;
    if (character !== "\\") {
      text += character;
      continue;
    }

    const escape = response[index + 1];
    if (escape === undefined) break;
    index += 1;
    if (escape === '"' || escape === "\\" || escape === "/") {
      text += escape;
    } else if (escape === "b") {
      text += "\b";
    } else if (escape === "f") {
      text += "\f";
    } else if (escape === "n") {
      text += "\n";
    } else if (escape === "r") {
      text += "\r";
    } else if (escape === "t") {
      text += "\t";
    } else if (escape === "u") {
      const codePoint = response.slice(index + 1, index + 5);
      if (codePoint.length !== 4 || !/^[\da-f]{4}$/i.test(codePoint)) break;
      text += String.fromCharCode(Number.parseInt(codePoint, 16));
      index += 4;
    } else {
      break;
    }
  }
  return text;
}

export function parseAssistantUtterance(response: string): AssistantUtterance {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    parsed = undefined;
  }
  return normalizeAssistantUtterance(
    parsed,
    extractAssistantUtteranceTextPrefix(response),
  );
}
