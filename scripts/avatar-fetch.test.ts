import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enableAnna, installAnna, verifyGlb } from "./avatar-fetch.mjs";

describe("private Anna installation", () => {
  it("enables Anna without discarding unrelated local settings", () => {
    const environment = enableAnna("OTHER=keep\nexport VITE_SODALIS_EVAL_AVATARS = 0\nVITE_SODALIS_DEFAULT_AVATAR=old");
    expect(environment).toBe("OTHER=keep\nVITE_SODALIS_EVAL_AVATARS=1\nVITE_SODALIS_DEFAULT_AVATAR=metahuman-anna-eval");
    expect(enableAnna(environment)).toBe(environment);
    expect(enableAnna("OTHER=keep")).toContain("OTHER=keep\nVITE_SODALIS_EVAL_AVATARS=1\n");
  });

  it("verifies both GLB integrity and the pinned checksum", () => {
    const bytes = Buffer.alloc(20);
    bytes.write("glTF");
    bytes.writeUInt32LE(2, 4);
    bytes.writeUInt32LE(bytes.length, 8);
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(() => verifyGlb(bytes, hash)).not.toThrow();
    expect(() => verifyGlb(bytes, "wrong")).toThrow("SHA-256");
    bytes.writeUInt32LE(21, 8);
    expect(() => verifyGlb(bytes, hash)).toThrow("complete GLB");
    expect(() => verifyGlb(Buffer.from("not a GLB"), hash)).toThrow("complete GLB");
  });

  it("preserves installed assets and settings on corrupt downloads or authentication failures", () => {
    const root = mkdtempSync(join(tmpdir(), "sodalis-avatar-test-"));
    const destination = join(root, "apps/desktop/public/avatars/eval");
    mkdirSync(destination, { recursive: true });
    const asset = join(destination, "anna-eval.glb");
    const env = join(root, "apps/desktop/.env.local");
    writeFileSync(asset, "existing avatar");
    writeFileSync(env, "OTHER=keep\n");
    try {
      expect(() => installAnna(root, (directory: string) => {
        writeFileSync(join(directory, "anna-eval.glb"), "corrupt");
      })).toThrow("complete GLB");
      expect(() => installAnna(root, () => {
        throw new Error("authentication failed");
      })).toThrow("authentication failed");
      expect(readFileSync(asset, "utf8")).toBe("existing avatar");
      expect(readFileSync(env, "utf8")).toBe("OTHER=keep\n");
      expect(readdirSync(destination)).toEqual(["anna-eval.glb"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
