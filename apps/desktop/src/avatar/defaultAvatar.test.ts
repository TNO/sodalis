import { describe, expect, it } from "vitest";
import { AVATAR_CATALOGUE, avatarCredit } from "./defaultAvatar.js";

describe("bundled avatars", () => {
  it("credits every catalogued avatar with its licence", () => {
    for (const asset of AVATAR_CATALOGUE.list()) {
      expect(avatarCredit(asset.id)).toMatchObject({
        label: expect.any(String),
        licence: expect.any(String),
      });
    }
  });
});
