import { AVATAR_PROFILE_ID, type AvatarAsset } from "@sodalis/avatar";

export interface AvatarAttribution {
  title: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}

export interface AvatarCatalogueEntry {
  asset: AvatarAsset;
  attribution: AvatarAttribution;
  /**
   * GLB file name for an avatar whose licence forbids publishing it in this
   * repository. The entry is listed only in builds that found the file in
   * the git-ignored public/avatars/licensed/ folder (see docs/avatar/licensed-avatars.md).
   */
  licensedFile?: string;
}

export const LICENSED_AVATAR_PATH = `${import.meta.env.BASE_URL}avatars/licensed/`;

export function availableAvatars(
  entries: readonly AvatarCatalogueEntry[],
  licensedFiles: readonly string[],
): AvatarCatalogueEntry[] {
  return entries.filter(
    (entry) =>
      entry.licensedFile === undefined || licensedFiles.includes(entry.licensedFile),
  );
}

const developmentBehavior = import.meta.env.DEV
  ? { behavior: { expressionScale: 6, headMotionScale: 3 } }
  : {};

const BRUNETTE: AvatarCatalogueEntry = {
  asset: {
    id: "talkinghead-brunette",
    name: "Brunette",
    modelUrl: `${import.meta.env.BASE_URL}avatars/talkinghead-brunette.glb`,
    profile: AVATAR_PROFILE_ID,
    hiddenNodes: ["Wolf3D_Glasses"],
    framing: { preferred: "upper-body" },
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
    modelUrl: `${import.meta.env.BASE_URL}avatars/sodalis-male-thuiszorg.glb`,
    profile: AVATAR_PROFILE_ID,
    // The MPFB A-pose is wider than the brunette's, which pushes the bounds-fitted camera back.
    framing: { preferred: "upper-body", cameraDistanceScale: 0.82 },
    ...developmentBehavior,
  },
  attribution: {
    title: "Sodalis male, built from CC0 MakeHuman assets",
    sourceUrl: `${import.meta.env.BASE_URL}avatars/NOTICE.md`,
    license: "MIT",
    licenseUrl: "https://opensource.org/license/mit",
  },
};

export const AVATAR_CATALOGUE: readonly AvatarCatalogueEntry[] = availableAvatars(
  [MALE_THUISZORG, BRUNETTE],
  __SODALIS_LICENSED_AVATARS__,
);

export const DEFAULT_AVATAR_ID = MALE_THUISZORG.asset.id;

const SELECTION_KEY = "sodalis.avatar.selection";

export interface AvatarSelection {
  readonly entries: readonly AvatarCatalogueEntry[];
  readonly selected: AvatarCatalogueEntry;
  select(id: string): void;
}

export interface AvatarSelectionOptions {
  storage?: Pick<Storage, "getItem" | "setItem">;
  entries?: readonly AvatarCatalogueEntry[];
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
  let selected = find(stored) ?? find(DEFAULT_AVATAR_ID) ?? entries[0];
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
