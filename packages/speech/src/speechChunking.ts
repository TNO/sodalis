export const DEFAULT_TTS_CHUNK_CHARACTERS = 320;
export const MIN_TTS_CHUNK_CHARACTERS = 80;
export const MAX_TTS_CHUNK_CHARACTERS = 1000;
export const DEFAULT_TTS_CHUNK_PAUSE_MS = 120;
export const MAX_TTS_CHUNK_PAUSE_MS = 1000;

export function isSpeechRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.75 && value <= 1.25;
}

export function isSpeechPauseMs(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_TTS_CHUNK_PAUSE_MS;
}

const CLOSING_QUOTES = new Set(["'", '"', "’", "”", "»", ")", "]", "}"]);
const ABBREVIATION_ENDING =
  /(?:\b(?:mr|mrs|ms|dr|prof|etc|e\.g|i\.e|a\.m|p\.m|dhr|mevr|mw|nr|enz|bijv|a\.u\.b|d\.w\.z|m\.a\.w|m\.b\.t|o\.a|ca)\.)$/i;

export function clampSpeechChunkSize(value: number): number {
  const finiteValue = Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_TTS_CHUNK_CHARACTERS;
  return Math.max(
    MIN_TTS_CHUNK_CHARACTERS,
    Math.min(MAX_TTS_CHUNK_CHARACTERS, finiteValue),
  );
}

export function clampSpeechChunkPauseMs(value: number): number {
  const finiteValue = Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_TTS_CHUNK_PAUSE_MS;
  return Math.max(0, Math.min(MAX_TTS_CHUNK_PAUSE_MS, finiteValue));
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let sentenceStart = 0;
  let index = 0;

  while (index < text.length) {
    if (!".!?".includes(text[index] ?? "")) {
      index += 1;
      continue;
    }

    let punctuationEnd = index + 1;
    while (
      punctuationEnd < text.length &&
      ".!?".includes(text[punctuationEnd] ?? "")
    ) {
      punctuationEnd += 1;
    }
    let boundaryEnd = punctuationEnd;
    while (CLOSING_QUOTES.has(text[boundaryEnd] ?? "")) boundaryEnd += 1;
    const nextCharacter = text[boundaryEnd];
    const isBoundary = nextCharacter === undefined || /\s/.test(nextCharacter);
    const isAbbreviation = ABBREVIATION_ENDING.test(
      text.slice(sentenceStart, punctuationEnd),
    );
    if (isBoundary && !isAbbreviation) {
      const sentence = text.slice(sentenceStart, boundaryEnd).trim();
      if (sentence) sentences.push(sentence);
      index = boundaryEnd;
      while (/\s/.test(text[index] ?? "")) index += 1;
      sentenceStart = index;
      continue;
    }
    index = boundaryEnd;
  }

  const remainder = text.slice(sentenceStart).trim();
  if (remainder) sentences.push(remainder);
  return sentences;
}

function splitClauses(sentence: string): string[] {
  const clauses: string[] = [];
  let start = 0;
  for (let index = 0; index < sentence.length; index += 1) {
    if (
      !",;:".includes(sentence[index] ?? "") ||
      !/\s/.test(sentence[index + 1] ?? "")
    ) {
      continue;
    }
    clauses.push(sentence.slice(start, index + 1).trim());
    index += 1;
    while (/\s/.test(sentence[index + 1] ?? "")) index += 1;
    start = index + 1;
  }
  const remainder = sentence.slice(start).trim();
  if (remainder) clauses.push(remainder);
  return clauses;
}

function splitWords(text: string, maxCharacters: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxCharacters) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function splitSpeechText(text: string, maxCharacters: number, sentenceBoundaries = false): string[] {
  const limit = clampSpeechChunkSize(maxCharacters);
  const trimmedText = text.trim();
  if (!trimmedText) return [];
  if (sentenceBoundaries) {
    return splitSentences(trimmedText).flatMap((sentence) => splitSpeechText(sentence, limit));
  }
  if (trimmedText.length <= limit) return [trimmedText];

  const segments: { readonly text: string; readonly separator: string }[] = [];
  let pendingSeparator = "";
  let firstSegment = true;
  for (const line of trimmedText.split(/(\n+)/)) {
    if (/^\n+$/.test(line)) {
      pendingSeparator = line;
      continue;
    }
    const sentences = splitSentences(line);
    for (const [sentenceIndex, sentence] of sentences.entries()) {
      const parts =
        sentence.length <= limit
          ? [sentence]
          : splitClauses(sentence).flatMap((clause) =>
              clause.length <= limit ? [clause] : splitWords(clause, limit),
            );
      for (const [partIndex, part] of parts.entries()) {
        segments.push({
          text: part,
          separator: firstSegment
            ? ""
            : sentenceIndex === 0 && partIndex === 0 && pendingSeparator
              ? pendingSeparator
              : " ",
        });
        firstSegment = false;
      }
    }
    pendingSeparator = "";
  }

  const chunks: string[] = [];
  let current = "";
  for (const segment of segments) {
    const candidate = current
      ? `${current}${segment.separator}${segment.text}`
      : segment.text;
    if (current && candidate.length > limit) {
      chunks.push(current);
      current = segment.text;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
