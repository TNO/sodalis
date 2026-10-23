import { describe, expect, it } from "vitest";
import { normalizeSpeechText } from "./speechTextNormalization.js";

describe("normalizeSpeechText", () => {
  it("speaks Dutch house numbers, ordinals, dates, times, money, and abbreviations", () => {
    expect(
      normalizeSpeechText(
        "Stationsstraat 24A, de 2e etage. Afspraak op 3-5-2024 om 14:30. Het kost €24,50; bel a.u.b. nr. 2.",
        "nl-NL",
      ),
    ).toBe(
      "Stationsstraat vierentwintig A, de tweede etage. Afspraak op derde mei tweeduizend vierentwintig om veertien uur dertig. Het kost vierentwintig euro en vijftig cent; bel alstublieft nummer twee.",
    );
  });

  it("normalizes English ordinals, dates, times, currency, and abbreviations", () => {
    expect(
      normalizeSpeechText(
        "Dr. Smith will pay $24.50 on 01/02/2024 at 9:05 a.m.; see the 2nd floor.",
        "en-US",
      ),
    ).toBe(
      "doctor Smith will pay twenty four dollars and fifty cents on second of january two thousand twenty four at nine oh five in the morning; see the second floor.",
    );
  });

  it("preserves invalid dates, unknown languages, and unsafe integers", () => {
    const invalidDate = "31-02-2024";
    const unsafeInteger = "9007199254740992";
    expect(normalizeSpeechText(invalidDate, "nl-NL")).toBe(invalidDate);
    expect(normalizeSpeechText(unsafeInteger, "nl-NL")).toBe(unsafeInteger);
    expect(normalizeSpeechText("Rue 24", "fr-FR")).toBe("Rue 24");
  });
});
