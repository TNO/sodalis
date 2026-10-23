export interface SpeechWordTimestamp {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

interface WordToken {
  readonly word: string;
  readonly normalized: string;
}

interface TimedWordToken extends WordToken {
  readonly start: number;
  readonly end: number;
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const MIN_INTERPOLATED_DURATION_SECONDS = 0.01;
const DEFAULT_WORD_DURATION_SECONDS = 0.25;
const MAX_ALIGNMENT_CELLS = 4_000_000;

function tokenize(text: string): WordToken[] {
  return [...text.matchAll(WORD_PATTERN)].map(([word]) => ({
    word,
    normalized: word.normalize("NFKC").toLocaleLowerCase("nl-NL"),
  }));
}

function flattenRecognizedWords(
  words: readonly SpeechWordTimestamp[],
): SpeechWordTimestamp[] {
  const flattened: SpeechWordTimestamp[] = [];
  let previousStart = -1;
  for (const timestamp of words) {
    if (!timestamp.word.trim()) {
      throw new RangeError("Recognized word timestamps must include a word.");
    }
    if (
      !Number.isFinite(timestamp.start) ||
      !Number.isFinite(timestamp.end) ||
      timestamp.start < 0 ||
      timestamp.end < timestamp.start
    ) {
      throw new RangeError("Word timestamps must have finite, non-negative start and end times.");
    }
    if (timestamp.start < previousStart) {
      throw new RangeError("Word timestamps must be ordered by start time.");
    }
    previousStart = timestamp.start;
    const tokens = tokenize(timestamp.word);
    for (const [index, token] of tokens.entries()) {
      const duration = timestamp.end - timestamp.start;
      const start = timestamp.start + (duration * index) / tokens.length;
      const end = timestamp.start + (duration * (index + 1)) / tokens.length;
      flattened.push({ word: token.word, start, end });
    }
  }
  return flattened;
}

function alignTokenIndices(
  source: readonly WordToken[],
  recognized: readonly TimedWordToken[],
): Array<SpeechWordTimestamp | undefined> {
  const stride = recognized.length + 1;
  const cellCount = (source.length + 1) * stride;
  if (cellCount > MAX_ALIGNMENT_CELLS) {
    throw new RangeError("Speech alignment exceeds the supported word count.");
  }
  const commonWords = new Int32Array(cellCount);
  for (let row = source.length - 1; row >= 0; row -= 1) {
    for (let column = recognized.length - 1; column >= 0; column -= 1) {
      const index = row * stride + column;
      if (source[row]!.normalized === recognized[column]!.normalized) {
        commonWords[index] = commonWords[index + stride + 1]! + 1;
      } else {
        commonWords[index] = Math.max(
          commonWords[index + stride]!,
          commonWords[index + 1]!,
        );
      }
    }
  }

  const alignment = new Array<SpeechWordTimestamp | undefined>(source.length);
  let row = 0;
  let column = 0;
  while (row < source.length && column < recognized.length) {
    if (source[row]!.normalized === recognized[column]!.normalized) {
      alignment[row] = {
        word: source[row]!.word,
        start: recognized[column]!.start,
        end: recognized[column]!.end,
      };
      row += 1;
      column += 1;
    } else if (
      commonWords[row * stride + column + stride]! >=
      commonWords[row * stride + column + 1]!
    ) {
      row += 1;
    } else {
      column += 1;
    }
  }
  return alignment;
}

export function alignSpeechWords(
  sourceText: string,
  recognizedWordTimestamps: readonly SpeechWordTimestamp[],
  durationSeconds?: number,
): SpeechWordTimestamp[] {
  if (
    durationSeconds !== undefined &&
    (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
  ) {
    throw new RangeError("Audio duration must be finite and positive.");
  }
  const sourceWords = tokenize(sourceText);
  if (!sourceWords.length) return [];
  const recognizedTimestamps = flattenRecognizedWords(recognizedWordTimestamps);
  const recognizedWords = recognizedTimestamps.map((timestamp) => ({
    word: timestamp.word,
    normalized: timestamp.word.normalize("NFKC").toLocaleLowerCase("nl-NL"),
    start: timestamp.start,
    end: timestamp.end,
  }));
  if (
    durationSeconds !== undefined &&
    recognizedTimestamps.some(({ end }) => end > durationSeconds)
  ) {
    throw new RangeError("Audio duration cannot be shorter than word timestamps.");
  }
  const alignment = alignTokenIndices(sourceWords, recognizedWords).map(
    (timestamp, index) =>
      timestamp ? { ...timestamp, word: sourceWords[index]!.word } : undefined,
  );
  const averageWordDuration = recognizedTimestamps.length
    ? Math.max(
        MIN_INTERPOLATED_DURATION_SECONDS,
        recognizedTimestamps.reduce(
          (total, timestamp) => total + timestamp.end - timestamp.start,
          0,
        ) / recognizedTimestamps.length,
      )
    : durationSeconds === undefined
      ? DEFAULT_WORD_DURATION_SECONDS
      : Math.max(
          MIN_INTERPOLATED_DURATION_SECONDS,
          durationSeconds / sourceWords.length,
        );

  let cursor = 0;
  while (cursor < alignment.length) {
    if (alignment[cursor]) {
      cursor += 1;
      continue;
    }
    const startIndex = cursor;
    while (cursor < alignment.length && !alignment[cursor]) cursor += 1;
    const count = cursor - startIndex;
    const previous = startIndex > 0 ? alignment[startIndex - 1] : undefined;
    const next = cursor < alignment.length ? alignment[cursor] : undefined;
    const left = previous?.end ?? 0;
    const right =
      next?.start ??
      durationSeconds ??
      left + averageWordDuration * count;
    if (right < left) {
      throw new RangeError("Word timestamps are not ordered around missing source words.");
    }
    const step = (right - left) / count;
    for (let offset = 0; offset < count; offset += 1) {
      const start = left + step * offset;
      alignment[startIndex + offset] = {
        word: sourceWords[startIndex + offset]!.word,
        start,
        end: start + step,
      };
    }
  }
  return alignment as SpeechWordTimestamp[];
}
