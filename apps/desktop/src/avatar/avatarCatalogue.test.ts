import { describe, expect, it } from "vitest";
import { AVATAR_PROFILE_ID, type AvatarAsset } from "@sodalis/avatar";
import { createAvatarCatalogue } from "./avatarCatalogue.js";

const asset = (id: string): AvatarAsset => ({
  id,
  name: id,
  modelUrl: `/avatars/${id}.glb`,
  profile: AVATAR_PROFILE_ID,
});

describe("createAvatarCatalogue", () => {
  const catalogue = createAvatarCatalogue([asset("first"), asset("second")]);

  it("lists entries in their declared order", () => {
    expect(catalogue.list().map((entry) => entry.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("selects the requested avatar from an ?avatar= query", () => {
    expect(catalogue.select("?avatar=second").id).toBe("second");
  });

  it("falls back to the first entry for missing or unknown ids", () => {
    expect(catalogue.select("").id).toBe("first");
    expect(catalogue.select("?avatar=unknown").id).toBe("first");
  });

  it("rejects an empty catalogue, duplicate ids, and invalid metadata", () => {
    expect(() => createAvatarCatalogue([])).toThrow(/at least one/);
    expect(() => createAvatarCatalogue([asset("a"), asset("a")])).toThrow(
      /Duplicate avatar id "a"/,
    );
    expect(() =>
      createAvatarCatalogue([{ ...asset("bad"), modelUrl: "" }]),
    ).toThrow(/bad/);
  });
});
