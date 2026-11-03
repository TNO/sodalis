import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

describe.skipIf(!dockerAvailable)("public Docker avatar boundary (requires Docker)", () => {
  it("excludes licensed and evaluation assets while keeping public assets", () => {
    const dir = mkdtempSync(join(tmpdir(), "sodalis-docker-boundary-"));
    try {
      const context = join(dir, "context");
      const output = join(dir, "output");
      const avatars = join(context, "apps/desktop/public/avatars");
      for (const folder of ["licensed", "eval", "public"]) {
        mkdirSync(join(avatars, folder), { recursive: true });
        writeFileSync(join(avatars, folder, "fixture.glb"), "synthetic test asset");
      }
      copyFileSync(new URL("../.dockerignore", import.meta.url), join(context, ".dockerignore"));
      writeFileSync(join(context, "Dockerfile"), "FROM scratch\nCOPY apps/ /apps/\n");

      const build = spawnSync("docker", [
        "build", "--output", `type=local,dest=${output}`, context,
      ], { encoding: "utf8", timeout: 25_000 });
      expect(build.error).toBeUndefined();
      expect(build.status, build.stderr).toBe(0);
      const builtAvatars = join(output, "apps/desktop/public/avatars");
      expect(existsSync(join(builtAvatars, "public/fixture.glb"))).toBe(true);
      expect(existsSync(join(builtAvatars, "licensed"))).toBe(false);
      expect(existsSync(join(builtAvatars, "eval"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
