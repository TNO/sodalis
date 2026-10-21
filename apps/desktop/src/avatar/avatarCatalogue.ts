import { validateAvatarAsset, type AvatarAsset } from "@sodalis/avatar";

export interface AvatarCatalogue {
  list(): readonly AvatarAsset[];
  select(search: string): AvatarAsset;
}

export function createAvatarCatalogue(
  entries: readonly AvatarAsset[],
  defaultId?: string,
): AvatarCatalogue {
  if (entries.length === 0) {
    throw new Error("An avatar catalogue needs at least one avatar.");
  }
  const byId = new Map<string, AvatarAsset>();
  for (const entry of entries) {
    const result = validateAvatarAsset(entry);
    if (!result.ok) {
      const detail = result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid avatar "${entry.id}": ${detail}`);
    }
    if (byId.has(result.asset.id)) {
      throw new Error(`Duplicate avatar id "${result.asset.id}".`);
    }
    byId.set(result.asset.id, result.asset);
  }
  const list = [...byId.values()];
  const fallback = (defaultId && byId.get(defaultId)) || (list[0] as AvatarAsset);

  return {
    list: () => list,
    select(search) {
      const id = new URLSearchParams(search).get("avatar");
      return (id && byId.get(id)) || fallback;
    },
  };
}
