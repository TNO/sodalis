import { toOrdinal, toWords } from "to-words";

type SpeechLocale = "nl-NL" | "en-US";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const DUTCH_MONTHS = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

const ABBREVIATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "nl-NL": {
    "a.u.b.": "alstublieft",
    "bijv.": "bijvoorbeeld",
    "dhr.": "meneer",
    "d.w.z.": "dat wil zeggen",
    "enz.": "enzovoort",
    "m.a.w.": "met andere woorden",
    "m.b.t.": "met betrekking tot",
    "mevr.": "mevrouw",
    "mw.": "mevrouw",
    "nr.": "nummer",
    "o.a.": "onder andere",
    "t/m": "tot en met",
    "ca.": "circa",
  },
  "en-US": {
    "dr.": "doctor",
    "e.g.": "for example",
    "etc.": "et cetera",
    "i.e.": "that is",
    "mr.": "mister",
    "mrs.": "misses",
    "ms.": "miss",
    "prof.": "professor",
  },
};

const NL_DIGITS = [
  "nul",
  "een",
  "twee",
  "drie",
  "vier",
  "vijf",
  "zes",
  "zeven",
  "acht",
  "negen",
];
const EN_DIGITS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

function localeFor(language: string): SpeechLocale | undefined {
  if (language === "nl-NL" || language === "nl-BE") return "nl-NL";
  if (language === "en-US" || language === "en-GB") return "en-US";
  return undefined;
}

function words(value: number, locale: SpeechLocale): string | undefined {
  if (!Number.isSafeInteger(value) || value < 0) return undefined;
  return toWords(value, { localeCode: locale }).toLocaleLowerCase(locale);
}

function ordinal(value: number, locale: SpeechLocale): string | undefined {
  if (!Number.isSafeInteger(value) || value <= 0) return undefined;
  return toOrdinal(value, { localeCode: locale }).toLocaleLowerCase(locale);
}

function normalizeDate(
  match: string,
  first: string,
  second: string,
  yearText: string,
  locale: SpeechLocale,
): string {
  const firstPart = Number(first);
  const secondPart = Number(second);
  const month = locale === "en-US" ? firstPart : secondPart;
  const day = locale === "en-US" ? secondPart : firstPart;
  const year = Number(yearText);
  const fullYear = yearText.length === 2 ? 2000 + year : year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return match;
  }

  const spokenDay = ordinal(day, locale);
  const spokenYear = words(fullYear, locale);
  if (!spokenDay || !spokenYear) return match;
  const monthName =
    locale === "nl-NL" ? DUTCH_MONTHS[month - 1] : MONTHS[month - 1];
  return locale === "en-US"
    ? `${spokenDay} of ${monthName} ${spokenYear}`
    : `${spokenDay} ${monthName} ${spokenYear}`;
}

function normalizeTime(
  match: string,
  hourText: string,
  minuteText: string,
  meridiem: string | undefined,
  locale: SpeechLocale,
): string {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const isTwelveHourTime = meridiem !== undefined;
  if (
    minute > 59 ||
    hour > (isTwelveHourTime ? 12 : 23) ||
    hour < (isTwelveHourTime ? 1 : 0)
  ) {
    return match;
  }

  const spokenHour = words(hour, locale);
  const spokenMinute =
    locale === "en-US" && minute > 0 && minute < 10
      ? `oh ${words(minute, locale)}`
      : words(minute, locale);
  if (!spokenHour || !spokenMinute) return match;
  if (locale === "nl-NL") return `${spokenHour} uur ${spokenMinute}`;
  if (meridiem) {
    const period = meridiem.toLowerCase().startsWith("a")
      ? "in the morning"
      : "in the afternoon";
    return `${spokenHour} ${minute === 0 ? "o'clock" : spokenMinute} ${period}`;
  }
  return `${spokenHour} ${minute === 0 ? "hundred" : spokenMinute}`;
}

interface CurrencyWords {
  readonly major: string;
  readonly majorPlural: string;
  readonly minor: string;
  readonly minorPlural: string;
}

function currencyWords(code: string, locale: SpeechLocale): CurrencyWords {
  if (code === "EUR") {
    return locale === "nl-NL"
      ? { major: "euro", majorPlural: "euro", minor: "cent", minorPlural: "cent" }
      : { major: "euro", majorPlural: "euros", minor: "cent", minorPlural: "cents" };
  }
  if (code === "GBP") {
    return locale === "nl-NL"
      ? { major: "pond", majorPlural: "pond", minor: "penny", minorPlural: "pence" }
      : { major: "pound", majorPlural: "pounds", minor: "penny", minorPlural: "pence" };
  }
  return locale === "nl-NL"
    ? { major: "dollar", majorPlural: "dollar", minor: "cent", minorPlural: "cent" }
    : { major: "dollar", majorPlural: "dollars", minor: "cent", minorPlural: "cents" };
}

function normalizeMoney(
  match: string,
  locale: SpeechLocale,
): string {
  const unit = match.match(/€|\$|£|\b(?:EUR|USD|GBP|euro'?s?|dollars?|pounds?)\b/i);
  const amountText = match.match(/\d[\d.,]*/)?.[0];
  if (!unit || !amountText) return match;

  const unitText = unit[0].toLowerCase();
  const code = unitText === "€" || /^(?:eur|euro)/i.test(unitText)
    ? "EUR"
    : unitText === "£" || /^(?:gbp|pound)/i.test(unitText)
      ? "GBP"
      : "USD";

  const lastComma = amountText.lastIndexOf(",");
  const lastDot = amountText.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);
  let majorText = amountText;
  let minorText = "";
  if (separatorIndex >= 0) {
    const fractionLength = amountText.length - separatorIndex - 1;
    if (fractionLength <= 2) {
      majorText = amountText.slice(0, separatorIndex);
      minorText = amountText.slice(separatorIndex + 1);
    } else if (fractionLength !== 3) {
      return match;
    }
  }
  const major = Number(majorText.replace(/[.,]/g, ""));
  const minor = minorText ? Number(minorText.padEnd(2, "0")) : 0;
  const majorWords = words(major, locale);
  const minorWords = minor ? words(minor, locale) : undefined;
  if (!majorWords || (minor && !minorWords)) return match;

  const currency = currencyWords(code, locale);
  const majorUnit = major === 1 ? currency.major : currency.majorPlural;
  const minorUnit = minor === 1 ? currency.minor : currency.minorPlural;
  const conjunction = locale === "nl-NL" ? "en" : "and";
  return minorWords
    ? `${majorWords} ${majorUnit} ${conjunction} ${minorWords} ${minorUnit}`
    : `${majorWords} ${majorUnit}`;
}

function normalizeNumber(match: string, locale: SpeechLocale): string {
  const separators = [...match.matchAll(/[.,]/g)];
  if (!separators.length) {
    return words(Number(match), locale) ?? match;
  }

  const distinctSeparators = new Set(separators.map(([separator]) => separator));
  const lastSeparator = separators.at(-1);
  if (!lastSeparator) return match;
  const separatorIndex = lastSeparator.index;
  const fractionLength = match.length - separatorIndex - 1;
  const isRepeatedThousands =
    distinctSeparators.size === 1 &&
    (separators.length > 1 || fractionLength === 3);
  if (isRepeatedThousands) {
    return words(Number(match.replace(/[.,]/g, "")), locale) ?? match;
  }

  const wholeText = match.slice(0, separatorIndex).replace(/[.,]/g, "");
  const fractionalText = match.slice(separatorIndex + 1);
  const wholeWords = words(Number(wholeText), locale);
  if (!wholeWords || !/^\d+$/.test(fractionalText)) return match;
  const digits = locale === "nl-NL" ? NL_DIGITS : EN_DIGITS;
  const decimalWord = locale === "nl-NL" ? "komma" : "point";
  const fractionalWords = [...fractionalText]
    .map((digit) => digits[Number(digit)])
    .join(" ");
  return `${wholeWords} ${decimalWord} ${fractionalWords}`;
}

function expandAbbreviations(text: string, locale: SpeechLocale): string {
  const abbreviations = Object.entries(ABBREVIATIONS[locale]).sort(
    ([left], [right]) => right.length - left.length,
  );
  return abbreviations.reduce((result, [abbreviation, expansion]) => {
    const escaped = abbreviation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"),
      expansion,
    );
  }, text);
}

export function normalizeSpeechText(text: string, language: string): string {
  const locale = localeFor(language);
  if (!locale) return text;

  const timePattern =
    /\b(\d{1,2}):(\d{2})(?:\s*(a\.?m\.?|p\.?m\.?))?(?![\p{L}\p{N}])/giu;
  const datePattern = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
  const moneyPattern =
    /(?:€|\$|£)\s*\d+(?:[.,]\d+)*|\b\d+(?:[.,]\d+)*\s*(?:EUR|USD|GBP|euro'?s?|dollars?|pounds?)\b/gi;
  const ordinalPattern =
    locale === "nl-NL" ? /\b(\d+)(?:e|de|ste)\b/gi : /\b(\d+)(?:st|nd|rd|th)\b/gi;
  const houseNumberPattern = /\b(\d+)([A-Za-z])\b/g;
  let normalized = text.replace(timePattern, (match, hour, minute, meridiem) =>
    normalizeTime(match, hour, minute, meridiem, locale),
  );
  const preservedDates: string[] = [];
  normalized = normalized.replace(
    datePattern,
    (match, first, second, year) => {
      const date = normalizeDate(match, first, second, year, locale);
      if (date !== match) return date;
      const index = preservedDates.push(match) - 1;
      return `${"\uE000".repeat(index + 1)}\uE001`;
    },
  );
  normalized = normalized.replace(moneyPattern, (match) =>
    normalizeMoney(match, locale),
  );
  normalized = normalized.replace(ordinalPattern, (match, numberText) => {
    const spoken = ordinal(Number(numberText), locale);
    return spoken ?? match;
  });
  normalized = normalized.replace(
    houseNumberPattern,
    (_match, numberText, suffix) =>
      `${words(Number(numberText), locale) ?? numberText} ${suffix}`,
  );
  normalized = normalized.replace(/\b\d+(?:[.,]\d+)*\b/g, (match) =>
    normalizeNumber(match, locale),
  );
  return expandAbbreviations(normalized, locale).replace(
    /\uE000(\uE000*)\uE001/g,
    (_marker, repeated) => preservedDates[repeated.length] ?? _marker,
  );
}
