import { describe, expect, it } from "vitest";
import { AVATAR_PROFILE_ID } from "@sodalis/avatar";
import {
  AVATAR_CATALOGUE,
  createAvatarSelection,
  validateCatalogue,
  type AvatarCatalogueEntry,
} from "./avatarCatalogue.js";

const entry = (id: string): AvatarCatalogueEntry => ({
  asset: { id, name: id, modelUrl: `/avatars/${id}.glb`, profile: AVATAR_PROFILE_ID },
  attribution: { title: id, sourceUrl: "/", license: "MIT", licenseUrl: "/" },
});

const noStorage = { getItem: () => null, setItem: () => undefined };

describe("avatar catalogue", () => {
  it("credits every catalogued avatar with its licence", () => {
    for (const { attribution } of AVATAR_CATALOGUE) {
      expect(attribution.title).not.toBe("");
      expect(attribution.license).not.toBe("");
    }
  });

  it("rejects an empty catalogue, duplicate ids, and invalid metadata", () => {
    expect(() => validateCatalogue([])).toThrow(/at least one/);
    expect(() => validateCatalogue([entry("a"), entry("a")])).toThrow(
      /Duplicate avatar id "a"/,
    );
    const bad = entry("bad");
    expect(() =>
      validateCatalogue([{ ...bad, asset: { ...bad.asset, modelUrl: "" } }]),
    ).toThrow(/bad/);
  });

  it("lets ?avatar= override the stored choice without storing it", () => {
    const setItem = () => {
      throw new Error("should not store");
    };
    const selection = createAvatarSelection({
      entries: [entry("first"), entry("second")],
      storage: { getItem: () => "first", setItem },
      search: "?avatar=second",
    });
    expect(selection.selected.asset.id).toBe("second");
  });

  it("uses a configured default and ignores unknown ids", () => {
    const entries = [entry("first"), entry("second")];
    expect(
      createAvatarSelection({ entries, storage: noStorage, defaultId: "second" })
        .selected.asset.id,
    ).toBe("second");
    expect(
      createAvatarSelection({
        entries,
        storage: noStorage,
        defaultId: "missing",
        search: "?avatar=unknown",
      }).selected.asset.id,
    ).toBe("first");
  });
});
