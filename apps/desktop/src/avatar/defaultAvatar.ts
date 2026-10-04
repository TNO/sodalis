import { AVATAR_PROFILE_ID, type AvatarAsset } from "@sodalis/avatar";

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
