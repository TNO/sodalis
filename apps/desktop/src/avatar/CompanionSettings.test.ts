// @vitest-environment jsdom

import m from "mithril";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionSettings } from "./CompanionSettings.js";
import {
  createCompanionPreferences,
  DEFAULT_COMPANION_PREFERENCES,
  subtitleContrast,
} from "./companionPreferences.js";

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("companion preferences", () => {
  it("persists all settings, validates stored values and reports storage failures", () => {
    const onError = vi.fn();
    const store = createCompanionPreferences({ storage: localStorage, onError });
    expect(store.value).toEqual(DEFAULT_COMPANION_PREFERENCES);
    const next = {
      speechRate: 0.8, sentencePauseMs: 600, shortSentences: true,
      subtitles: false, subtitleSize: 28, subtitleColor: "#ffff00", subtitleBackground: "#000000",
    };
    store.update(next);
    expect(createCompanionPreferences({ storage: localStorage }).value).toEqual(next);
    expect(() => store.update({ speechRate: NaN })).toThrow(RangeError);
    expect(() => store.update({ subtitleColor: "red;display:none" })).toThrow(RangeError);
    localStorage.setItem("sodalis.companion.preferences", '{"speechRate":0}');
    expect(createCompanionPreferences({ storage: localStorage, onError }).value).toEqual(DEFAULT_COMPANION_PREFERENCES);
    expect(onError).toHaveBeenCalledOnce();
    const unavailable = createCompanionPreferences({
      storage: { getItem: () => null, setItem: () => { throw new Error("storage denied"); } },
      onError,
    });
    unavailable.update({ subtitles: false });
    expect(unavailable.value.subtitles).toBe(false);
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining("could not be saved") }));
    expect(subtitleContrast(DEFAULT_COMPANION_PREFERENCES)).toBeGreaterThan(4.5);
  });

  it("exposes labeled controls, a live preview and a low-contrast warning", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const store = createCompanionPreferences({ storage: localStorage });
    const render = () => m.render(host, m(CompanionSettings, { store }));
    render();
    const speed = host.querySelector<HTMLInputElement>("input[type=range]")!;
    speed.value = "0.8";
    speed.dispatchEvent(new Event("input", { bubbles: true }));
    const short = host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    short.checked = true;
    short.dispatchEvent(new Event("change", { bubbles: true }));
    const size = host.querySelector("select")!;
    size.value = "28";
    size.dispatchEvent(new Event("change", { bubbles: true }));
    render();
    expect(store.value).toMatchObject({ speechRate: 0.8, shortSentences: true, subtitleSize: 28 });
    expect(host.querySelector<HTMLElement>(".companion-subtitle-preview")?.style.fontSize).toBe("28px");
    store.update({ subtitleColor: "#20252b" });
    render();
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Low subtitle contrast");
    m.render(host, []);
  });
});
