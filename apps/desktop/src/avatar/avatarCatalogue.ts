import {
  AVATAR_PROFILE_ID,
  validateAvatarAsset,
  type AvatarAsset,
  type AvatarDynamicBone,
} from "@sodalis/avatar";

export interface AvatarAttribution {
  title: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}

export interface AvatarCatalogueEntry {
  asset: AvatarAsset;
  attribution: AvatarAttribution;
}

const BASE = import.meta.env.BASE_URL;
const NOTICE_URL = `${BASE}avatars/NOTICE.md`;

const developmentBehavior = import.meta.env.DEV
  ? { behavior: { expressionScale: 6, headMotionScale: 3 } }
  : {};

const BRUNETTE: AvatarCatalogueEntry = {
  asset: {
    id: "talkinghead-brunette",
    name: "Brunette",
    modelUrl: `${BASE}avatars/talkinghead-brunette.glb`,
    profile: AVATAR_PROFILE_ID,
    hiddenNodes: ["Wolf3D_Glasses"],
    framing: { preferred: "bust" },
    ...developmentBehavior,
  },
  attribution: {
    title: "Ready Player Me brunette (TalkingHead example)",
    sourceUrl:
      "https://github.com/met4citizen/TalkingHead/blob/v1.7.0/avatars/brunette.glb",
    license: "CC BY-NC 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
};

const MALE_THUISZORG: AvatarCatalogueEntry = {
  asset: {
    id: "sodalis-male-thuiszorg",
    name: "Male",
    modelUrl: `${BASE}avatars/sodalis-male-thuiszorg.glb`,
    profile: AVATAR_PROFILE_ID,
    // The MPFB A-pose is wider than the brunette's, which pushes the bounds-fitted camera back.
    framing: { preferred: "bust", cameraDistanceScale: 0.82 },
    ...developmentBehavior,
  },
  attribution: {
    title: "Sodalis male, built from CC0 MakeHuman assets",
    sourceUrl: NOTICE_URL,
    license: "MIT",
    licenseUrl: "https://opensource.org/license/mit",
  },
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
const MPFB_CANDIDATES: AvatarCatalogueEntry[] = [
  {
    asset: {
      id: "sodalis-henk",
      name: "Henk",
      modelUrl: `${BASE}avatars/sodalis-henk.glb`,
      profile: AVATAR_PROFILE_ID,
      framing: { preferred: "bust" },
    },
    attribution: {
      title: "Henk (MakeHuman/MPFB assets)",
      sourceUrl: NOTICE_URL,
      license: "CC0 1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
  },
  {
    asset: {
      id: "sodalis-sofia",
      name: "Sofia",
      modelUrl: `${BASE}avatars/sodalis-sofia.glb`,
      profile: AVATAR_PROFILE_ID,
      framing: { preferred: "bust" },
      dynamicBones: hairSprings(5, 3),
    },
    attribution: {
      title:
        "Sofia (MakeHuman/MPFB assets by Elvaerwyn, punkduck, Mindfront and others)",
      sourceUrl: NOTICE_URL,
      license: "CC BY 4.0 and CC0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    },
  },
];

const UNREAL_EULA = "https://www.unrealengine.com/eula/unreal";

function metahumanEval(id: string, name: string): AvatarCatalogueEntry {
  return {
    asset: {
      id: `metahuman-${id}-eval`,
      name: `${name} (MetaHuman eval)`,
      modelUrl: `${BASE}avatars/eval/${id}-eval.glb`,
      profile: AVATAR_PROFILE_ID,
      framing: { preferred: "bust" },
      // TalkingHead's hip/side poses read as exaggerated on MetaHuman proportions.
      behavior: { poseScale: 0.35 },
    },
    attribution: {
      title: `${name} (Epic MetaHuman, evaluation only; not for redistribution)`,
      sourceUrl: UNREAL_EULA,
      license: "Unreal Engine EULA",
      licenseUrl: UNREAL_EULA,
    },
  };
}

// Evaluation-only MetaHuman conversions (TASKS/0054). Their GLBs are built
// outside the repository into the git-ignored public/avatars/eval/ folder and
// are not approved for redistribution, so they are listed only when a
// developer opts in with VITE_SODALIS_EVAL_AVATARS=1.
const EVALUATION_CANDIDATES: AvatarCatalogueEntry[] = [
  metahumanEval("anna", "Anna"),
  metahumanEval("odette", "Odette"),
];

const devOnly = import.meta.env.DEV && import.meta.env.MODE !== "test";

export const AVATAR_CATALOGUE: readonly AvatarCatalogueEntry[] = validateCatalogue([
  MALE_THUISZORG,
  BRUNETTE,
  ...(devOnly ? MPFB_CANDIDATES : []),
  ...(devOnly && import.meta.env.VITE_SODALIS_EVAL_AVATARS === "1"
    ? EVALUATION_CANDIDATES
    : []),
]);

// Development-only override of the avatar shown before the user picks one.
const DEFAULT_OVERRIDE = devOnly
  ? import.meta.env.VITE_SODALIS_DEFAULT_AVATAR
  : undefined;

export const DEFAULT_AVATAR_ID =
  AVATAR_CATALOGUE.find((entry) => entry.asset.id === DEFAULT_OVERRIDE)?.asset
    .id ?? MALE_THUISZORG.asset.id;

/** Validates every asset and rejects duplicate ids. */
export function validateCatalogue(
  entries: readonly AvatarCatalogueEntry[],
): AvatarCatalogueEntry[] {
  if (entries.length === 0) {
    throw new Error("An avatar catalogue needs at least one avatar.");
  }
  const seen = new Set<string>();
  return entries.map((entry) => {
    const result = validateAvatarAsset(entry.asset);
    if (!result.ok) {
      const detail = result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid avatar "${entry.asset.id}": ${detail}`);
    }
    if (seen.has(result.asset.id)) {
      throw new Error(`Duplicate avatar id "${result.asset.id}".`);
    }
    seen.add(result.asset.id);
    return { ...entry, asset: result.asset };
  });
}

const SELECTION_KEY = "sodalis.avatar.selection";

export interface AvatarSelection {
  readonly entries: readonly AvatarCatalogueEntry[];
  readonly selected: AvatarCatalogueEntry;
  select(id: string): void;
}

export interface AvatarSelectionOptions {
  storage?: Pick<Storage, "getItem" | "setItem">;
  entries?: readonly AvatarCatalogueEntry[];
  defaultId?: string;
  /** A location search string; `?avatar=<id>` overrides the stored choice for this page. */
  search?: string;
  onChange?: (entry: AvatarCatalogueEntry) => void;
  onError?: (error: Error) => void;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function createAvatarSelection(
  options: AvatarSelectionOptions = {},
): AvatarSelection {
  const entries = options.entries ?? AVATAR_CATALOGUE;
  const reportError =
    options.onError ??
    ((error: Error) => console.error("Avatar selection error:", error));
  let storage = options.storage;
  if (!storage && typeof window !== "undefined") {
    try {
      storage = window.localStorage;
    } catch (error) {
      reportError(asError(error));
    }
  }

  const find = (id: string | null | undefined) =>
    entries.find((entry) => entry.asset.id === id);
  let stored: string | null = null;
  try {
    stored = storage?.getItem(SELECTION_KEY) ?? null;
  } catch (error) {
    reportError(asError(error));
  }
  const requested = options.search
    ? new URLSearchParams(options.search).get("avatar")
    : null;
  let selected =
    find(requested) ??
    find(stored) ??
    find(options.defaultId ?? DEFAULT_AVATAR_ID) ??
    entries[0];
  if (!selected) throw new Error("The avatar catalogue is empty.");

  return {
    entries,
    get selected() {
      return selected;
    },
    select(id) {
      const next = find(id);
      if (!next) throw new RangeError(`Unknown avatar "${id}".`);
      if (next === selected) return;
      selected = next;
      try {
        storage?.setItem(SELECTION_KEY, id);
      } catch (error) {
        reportError(asError(error));
      }
      options.onChange?.(next);
    },
  };
}
