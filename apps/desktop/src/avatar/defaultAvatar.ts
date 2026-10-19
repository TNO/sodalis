import { AVATAR_PROFILE_ID, type AvatarAsset } from "@sodalis/avatar";
import { createAvatarCatalogue } from "./avatarCatalogue.js";

export const DEFAULT_AVATAR_ASSET: AvatarAsset = {
  id: "talkinghead-brunette",
  name: "Brunette",
  modelUrl: `${import.meta.env.BASE_URL}avatars/talkinghead-brunette.glb`,
  profile: AVATAR_PROFILE_ID,
  hiddenNodes: ["Wolf3D_Glasses"],
  framing: { preferred: "upper-body" },
  ...(import.meta.env.DEV
    ? {
        behavior: {
          expressionScale: 6,
          headMotionScale: 3,
        },
      }
    : {}),
};

// MPFB candidates stay development-only until TASKS/0014 verifies their licences.
const MPFB_CANDIDATES: AvatarAsset[] = [
  {
    id: "sodalis-henk",
    name: "Henk",
    modelUrl: `${import.meta.env.BASE_URL}avatars/sodalis-henk.glb`,
    profile: AVATAR_PROFILE_ID,
    framing: { preferred: "upper-body" },
  },
];

export const AVATAR_CATALOGUE = createAvatarCatalogue([
  DEFAULT_AVATAR_ASSET,
  ...(import.meta.env.DEV ? MPFB_CANDIDATES : []),
]);

export const ACTIVE_AVATAR_ASSET = AVATAR_CATALOGUE.select(
  typeof location === "undefined" ? "" : location.search,
);
