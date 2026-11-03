import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Copies licensed avatars from a local clone of the private asset store into
 * the git-ignored folder the desktop build bundles. See
 * docs/avatar/licensed-avatars.md.
 */
export const LICENSED_AVATAR_TARGET = fileURLToPath(
  new URL("../apps/desktop/public/avatars/licensed/", import.meta.url),
);

export function syncLicensedAvatars(source: string, target: string): string[] {
  if (!existsSync(join(source, "NOTICE.md"))) {
    throw new Error(
      `${source} has no NOTICE.md; licensed avatars must ship with their terms.`,
    );
  }
  const glbs = readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".glb"))
    .map((entry) => entry.name)
    .sort();
  if (glbs.length === 0) throw new Error(`${source} contains no .glb files.`);

  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const name of ["NOTICE.md", ...glbs]) {
    copyFileSync(join(source, name), join(target, name));
  }
  return glbs;
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.argv[2] ?? process.env.SODALIS_LICENSED_AVATARS_DIR;
  if (!source) {
    console.error(
      "Usage: pnpm avatars:licensed <private-asset-store-clone>\n" +
        "   or set SODALIS_LICENSED_AVATARS_DIR.",
    );
    process.exit(1);
  }
  const glbs = syncLicensedAvatars(resolve(source), LICENSED_AVATAR_TARGET);
  console.log(`Copied ${glbs.join(", ")} and NOTICE.md to ${LICENSED_AVATAR_TARGET}`);
  console.log("Restart the dev server so the catalogue lists them.");
}
