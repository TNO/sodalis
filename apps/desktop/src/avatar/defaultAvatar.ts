import {
  AVATAR_PROFILE_ID,
  type AvatarAsset,
  type AvatarDynamicBone,
} from "@sodalis/avatar";
import { createAvatarCatalogue } from "./avatarCatalogue.js";

export const DEFAULT_AVATAR_ASSET: AvatarAsset = {
  id: "talkinghead-brunette",
  name: "Brunette",
  modelUrl: `${import.meta.env.BASE_URL}avatars/talkinghead-brunette.glb`,
  profile: AVATAR_PROFILE_ID,
  hiddenNodes: ["Wolf3D_Glasses"],
  framing: { preferred: "bust" },
  ...(import.meta.env.DEV
    ? {
        behavior: {
          expressionScale: 6,
          headMotionScale: 3,
        },
      }
    : {}),
};

const HAIR_COLLIDERS: AvatarDynamicBone["excludes"] = [
  { bone: "Neck", radius: 0.07 },
  { bone: "Spine2", radius: 0.1 },
  { bone: "LeftArm", radius: 0.06 },
  { bone: "RightArm", radius: 0.06 },
];

/**
 * Springs for the Hair<chain>_<n> chains that build_avatar.py adds from a
 * recipe's hairBones. Each listed bone swings its parent, so the chain root
 * stays fixed to Head; segments stiffen towards the tips.
 */
function hairSprings(chains: number, segments: number): AvatarDynamicBone[] {
  return Array.from({ length: chains }, (_, chain) =>
    Array.from({ length: segments }, (_, segment) => ({
      bone: `Hair${chain + 1}_${segment + 2}`,
      type: "link" as const,
      stiffness: 30 + 35 * segment,
      damping: 4 + segment,
      external: 0.8,
      excludes: HAIR_COLLIDERS,
    })),
  ).flat();
}

// MPFB candidates stay development-only until TASKS/0014 verifies their licences.
const MPFB_CANDIDATES: AvatarAsset[] = [
  {
    id: "sodalis-henk",
    name: "Henk",
    modelUrl: `${import.meta.env.BASE_URL}avatars/sodalis-henk.glb`,
    profile: AVATAR_PROFILE_ID,
    framing: { preferred: "bust" },
  },
  {
    id: "sodalis-sofia",
    name: "Sofia",
    modelUrl: `${import.meta.env.BASE_URL}avatars/sodalis-sofia.glb`,
    profile: AVATAR_PROFILE_ID,
    framing: { preferred: "bust" },
    dynamicBones: hairSprings(5, 3),
  },
];

// Evaluation-only MetaHuman conversion (TASKS/0054). Its GLB is built outside
// the repository into the git-ignored public/avatars/eval/ folder and is not
// approved for redistribution, so it is listed only when a developer opts in
// with VITE_SODALIS_EVAL_AVATARS=1.
const EVALUATION_CANDIDATES: AvatarAsset[] = [
  {
    id: "metahuman-anna-eval",
    name: "Anna (MetaHuman eval)",
    modelUrl: `${import.meta.env.BASE_URL}avatars/eval/anna-eval.glb`,
    profile: AVATAR_PROFILE_ID,
    framing: { preferred: "bust" },
    // TalkingHead's hip/side poses read as exaggerated on MetaHuman proportions.
    behavior: { poseScale: 0.35 },
  },
];

export const AVATAR_CATALOGUE = createAvatarCatalogue(
  [
    DEFAULT_AVATAR_ASSET,
    ...(import.meta.env.DEV ? MPFB_CANDIDATES : []),
    ...(import.meta.env.DEV && import.meta.env.VITE_SODALIS_EVAL_AVATARS === "1"
      ? EVALUATION_CANDIDATES
      : []),
  ],
  // Development-only override of the avatar shown without ?avatar=.
  import.meta.env.DEV ? import.meta.env.VITE_SODALIS_DEFAULT_AVATAR : undefined,
);

export const ACTIVE_AVATAR_ASSET = AVATAR_CATALOGUE.select(
  typeof location === "undefined" ? "" : location.search,
);

export interface AvatarCredit {
  label: string;
  href: string;
  licence: string;
  licenceHref: string;
}

const NOTICE_URL = `${import.meta.env.BASE_URL}avatars/NOTICE.md`;

const AVATAR_CREDITS: Readonly<Record<string, AvatarCredit>> = {
  "talkinghead-brunette": {
    label: "Ready Player Me brunette (TalkingHead example)",
    href: "https://github.com/met4citizen/TalkingHead/blob/v1.7.0/avatars/brunette.glb",
    licence: "CC BY-NC 4.0",
    licenceHref: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
  "sodalis-henk": {
    label: "Henk (MakeHuman/MPFB assets)",
    href: NOTICE_URL,
    licence: "CC0 1.0",
    licenceHref: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  "sodalis-sofia": {
    label: "Sofia (MakeHuman/MPFB assets by Elvaerwyn, punkduck, Mindfront and others)",
    href: NOTICE_URL,
    licence: "CC BY 4.0 and CC0",
    licenceHref: "https://creativecommons.org/licenses/by/4.0/",
  },
  "metahuman-anna-eval": {
    label: "Anna (Epic MetaHuman, evaluation only; not for redistribution)",
    href: "https://www.unrealengine.com/eula/unreal",
    licence: "Unreal Engine EULA",
    licenceHref: "https://www.unrealengine.com/eula/unreal",
  },
};

export function avatarCredit(id: string): AvatarCredit {
  const credit = AVATAR_CREDITS[id];
  if (!credit) throw new Error(`Avatar "${id}" has no credit.`);
  return credit;
}

export const ACTIVE_AVATAR_CREDIT = avatarCredit(ACTIVE_AVATAR_ASSET.id);
