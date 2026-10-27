import { describe, expect, it } from "vitest";
import { AVATAR_PROFILE_ID } from "@sodalis/avatar";
import {
  AVATAR_CATALOGUE,
  LICENSED_AVATAR_PATH,
  availableAvatars,
  type AvatarCatalogueEntry,
} from "./avatarCatalogue.js";

const licensed: AvatarCatalogueEntry = {
  asset: {
    id: "licensed-test",
    name: "Licensed test",
    profile: AVATAR_PROFILE_ID,
    modelUrl: `${LICENSED_AVATAR_PATH}licensed-test.glb`,
  },
  attribution: AVATAR_CATALOGUE[0]!.attribution,
  licensedFile: "licensed-test.glb",
};

describe("licensed avatars", () => {
  it("lists a licensed avatar only when the build found its GLB", () => {
    const entries = [...AVATAR_CATALOGUE, licensed];

    expect(availableAvatars(entries, []).map((entry) => entry.asset.id)).toEqual(
      AVATAR_CATALOGUE.map((entry) => entry.asset.id),
    );
    expect(
      availableAvatars(entries, ["licensed-test.glb"]).map((entry) => entry.asset.id),
    ).toContain("licensed-test");
  });

  it("does not list a licensed avatar for a different file", () => {
    expect(availableAvatars([licensed], ["other.glb"])).toEqual([]);
  });
});
