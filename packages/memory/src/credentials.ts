export const REDACTED_CREDENTIAL = "[credential removed]";

const SECRET_LABEL =
  "(?:wachtwoord|paswoord|password|passwd|pincode|pin-code|pin|toegangscode|beveiligingscode|verificatiecode|" +
  "security code|passcode|api[- ]?key|apisleutel|token|secret|geheime code|cvc|cvv)";

/** Label-introduced secrets: "mijn wachtwoord is Tulp123!", "PIN: 1234". */
const LABELLED = new RegExp(
  `(${SECRET_LABEL}\\b[^\\n.?!]{0,40}?(?:\\bis\\b|\\bwas\\b|\\bluidt\\b|=|:))\\s*["'“]?([^\\s"'”,;]{3,})`,
  "giu",
);

const TOKEN_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** Long random-looking tokens that mix letters and digits (32+ chars). */
const GENERIC_TOKEN = /\b(?=[A-Za-z0-9_+/=-]*[0-9])(?=[A-Za-z0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{32,}\b/g;

const CARD_NUMBER = /\b(?:\d[ -]?){12,18}\d\b/g;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export interface CredentialScan {
  readonly text: string;
  readonly found: boolean;
}

/**
 * Detects passwords, PIN codes, API keys, tokens, private keys, and payment
 * card numbers, and replaces them with a placeholder. Memory never stores
 * credentials, so this runs before a turn is persisted or extracted.
 */
export function redactCredentials(text: string): CredentialScan {
  let found = false;
  let result = text.replace(LABELLED, (_match, label: string) => {
    found = true;
    return `${label} ${REDACTED_CREDENTIAL}`;
  });
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, () => {
      found = true;
      return REDACTED_CREDENTIAL;
    });
  }
  result = result.replace(GENERIC_TOKEN, () => {
    found = true;
    return REDACTED_CREDENTIAL;
  });
  result = result.replace(CARD_NUMBER, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !passesLuhn(digits)) return match;
    found = true;
    return REDACTED_CREDENTIAL;
  });
  return { text: result, found };
}
