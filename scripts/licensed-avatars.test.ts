import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncLicensedAvatars } from "./licensed-avatars.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sodalis-avatars-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("licensed avatar sync", () => {
  it("copies only the GLBs and notice, replacing stale avatars", () => {
    const source = tempDir();
    const target = join(tempDir(), "licensed");
    writeFileSync(join(source, "NOTICE.md"), "terms");
    writeFileSync(join(source, "anna.glb"), "glb");
    writeFileSync(join(source, "README.md"), "private notes");
    mkdirSync(join(source, ".git"));
    mkdirSync(target);
    writeFileSync(join(target, "removed.glb"), "old");

    expect(syncLicensedAvatars(source, target)).toEqual(["anna.glb"]);
    expect(readdirSync(target).sort()).toEqual(["NOTICE.md", "anna.glb"]);
  });

  it("refuses a store without a notice and leaves the target untouched", () => {
    const source = tempDir();
    const target = tempDir();
    writeFileSync(join(source, "anna.glb"), "glb");
    writeFileSync(join(target, "kept.glb"), "old");

    expect(() => syncLicensedAvatars(source, target)).toThrow(/NOTICE\.md/);
    expect(existsSync(join(target, "kept.glb"))).toBe(true);
  });
});
