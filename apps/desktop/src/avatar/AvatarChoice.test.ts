// @vitest-environment jsdom

import m from "mithril";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarChoice } from "./AvatarChoice.js";
import { createAvatarSelection } from "./avatarCatalogue.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe("avatar selection", () => {
  it("defaults to three dots when no choice is stored", () => {
    const selection = createAvatarSelection({ storage: memoryStorage() });

    expect(selection.selected.asset.id).toBe("sodalis-dots");
    expect(selection.entries.map((entry) => entry.asset.name)).toEqual([
      "Male",
      "Brunette",
      "Three dots",
    ]);
  });

  it("remembers the chosen avatar on this device", () => {
    const storage = memoryStorage();
    const onChange = vi.fn();
    createAvatarSelection({ storage, onChange }).select("talkinghead-brunette");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: expect.objectContaining({ id: "talkinghead-brunette" }),
      }),
    );
    expect(createAvatarSelection({ storage }).selected.asset.name).toBe("Brunette");
  });

  it("persists the dot presentation without requiring a model URL", () => {
    const storage = memoryStorage({
      "sodalis.avatar.selection": "sodalis-male-thuiszorg",
    });
    createAvatarSelection({ storage }).select("sodalis-dots");
    const asset = createAvatarSelection({ storage }).selected.asset;
    expect(asset).toMatchObject({ presentation: "dots", name: "Three dots" });
    expect(asset).not.toHaveProperty("modelUrl");
  });

  it("preserves a saved human avatar instead of replacing it with the default", () => {
    const storage = memoryStorage({
      "sodalis.avatar.selection": "sodalis-male-thuiszorg",
    });

    expect(createAvatarSelection({ storage }).selected.asset.id).toBe(
      "sodalis-male-thuiszorg",
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("falls back to the default for an unknown stored avatar without overwriting it", () => {
    const storage = memoryStorage({ "sodalis.avatar.selection": "retired-avatar" });

    expect(createAvatarSelection({ storage }).selected.asset.id).toBe(
      "sodalis-dots",
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects avatars that are not in the catalogue", () => {
    const selection = createAvatarSelection({ storage: memoryStorage() });

    expect(() => selection.select("missing")).toThrow('Unknown avatar "missing".');
    expect(selection.selected.asset.id).toBe("sodalis-dots");
  });

  it("still switches when storage is unavailable and reports the failure", () => {
    const onError = vi.fn();
    const selection = createAvatarSelection({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("Storage is full");
        },
      },
      onError,
    });

    selection.select("talkinghead-brunette");

    expect(selection.selected.asset.id).toBe("talkinghead-brunette");
    expect(onError).toHaveBeenCalledWith(new Error("Storage is full"));
  });
});

describe("AvatarChoice", () => {
  let host: HTMLElement | undefined;

  afterEach(() => {
    if (host) m.mount(host, null);
    host = undefined;
    document.body.replaceChildren();
  });

  it("lets the user switch avatars and shows the selected model's license", () => {
    const selection = createAvatarSelection({ storage: memoryStorage() });
    const mounted = document.createElement("div");
    host = mounted;
    document.body.append(mounted);
    m.mount(mounted, { view: () => m(AvatarChoice, { selection }) });

    const group = mounted.querySelector("fieldset");
    expect(group?.querySelector("legend")?.textContent).toBe("Avatar");
    const radios = [...mounted.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios.map((radio) => radio.checked)).toEqual([false, false, true]);
    expect(mounted.textContent).toContain(
      "Sodalis abstract companion",
    );
    expect(mounted.textContent).not.toContain("CC BY-NC 4.0");

    radios[1]?.click();
    m.redraw.sync();

    expect(selection.selected.asset.name).toBe("Brunette");
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
    expect(mounted.textContent).toContain(
      "Ready Player Me brunette (TalkingHead example)",
    );
    expect(mounted.textContent).toContain("CC BY-NC 4.0");
    radios[2]?.click();
    m.redraw.sync();
    expect(selection.selected.asset.name).toBe("Three dots");
    expect(mounted.textContent).toContain("Sodalis abstract companion");
    expect(mounted.textContent).not.toContain("CC BY-NC 4.0");
  });
});
