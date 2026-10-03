import {
  Bone,
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";
import { describe, expect, it } from "vitest";
import { AVATAR_ARKIT_SHAPES, AVATAR_VISEMES } from "../index.js";
import {
  validateAvatarGlb,
  validateAvatarScene,
} from "./AvatarGlbValidator.js";

const coreBones = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"];

function createCompatibleScene() {
  const scene = new Scene();
  const root = new Group();
  root.name = "AvatarRoot";
  scene.add(root);

  const bones = coreBones.map((name) => {
    const bone = new Bone();
    bone.name = name;
    return bone;
  });
  bones.forEach((bone, index) => {
    if (index === 0) root.add(bone);
    else bones[index - 1]?.add(bone);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([-0.3, 0, 0, 0.3, 0, 0, 0, 1.8, 0], 3),
  );
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.name = "Body";
  const morphNames = [...AVATAR_ARKIT_SHAPES, ...AVATAR_VISEMES];
  mesh.morphTargetDictionary = Object.fromEntries(
    morphNames.map((name, index) => [name, index]),
  );
  mesh.morphTargetInfluences = morphNames.map(() => 0);
  mesh.bind(new Skeleton(bones));
  root.add(mesh);
  scene.updateMatrixWorld(true);

  return { scene, root, bones, mesh };
}

function findCheck(
  report: ReturnType<typeof validateAvatarScene>,
  id: string,
) {
  const check = report.checks.find((item) => item.id === id);
  if (!check) throw new Error(`Expected validator check "${id}".`);
  return check;
}

describe("avatar GLB validator", () => {
  it("reports named compatibility checks for a compatible scene", () => {
    const { scene } = createCompatibleScene();
    const report = validateAvatarScene(scene);

    expect(report.valid).toBe(true);
    expect(report.checks.map((check) => check.id)).toEqual([
      "rig",
      "morphs",
      "materials",
      "textures",
      "triangles",
      "draw-calls",
      "bounds",
    ]);
    expect(report.metrics.triangleCount).toBe(1);
    expect(findCheck(report, "rig").status).toBe("pass");
    expect(findCheck(report, "morphs").status).toBe("pass");
  });

  it("reports missing rig joints and every missing facial target", () => {
    const { scene, bones, mesh } = createCompatibleScene();
    bones[4]?.remove(bones[5]!);
    delete mesh.morphTargetDictionary?.mouthPucker;
    delete mesh.morphTargetDictionary?.viseme_U;

    const report = validateAvatarScene(scene);

    expect(report.valid).toBe(false);
    expect(findCheck(report, "rig").status).toBe("fail");
    expect(findCheck(report, "rig").message).toContain("Head");
    expect(findCheck(report, "morphs").status).toBe("fail");
    expect(findCheck(report, "morphs").message).toContain("mouthPucker");
    expect(findCheck(report, "morphs").message).toContain("viseme_U");
  });

  it("rejects a skinned mesh with missing skin attributes", () => {
    const { scene, mesh } = createCompatibleScene();
    mesh.geometry.deleteAttribute("skinWeight");

    const report = validateAvatarScene(scene);

    expect(report.valid).toBe(false);
    expect(findCheck(report, "rig").message).toContain("skinWeight");
  });

  it("rejects required joints that are not in a Hips-rooted hierarchy", () => {
    const { scene, bones, root } = createCompatibleScene();
    root.add(bones[1]!);

    const report = validateAvatarScene(scene);

    expect(report.valid).toBe(false);
    expect(findCheck(report, "rig").status).toBe("fail");
    expect(findCheck(report, "rig").message).toContain(
      "not connected in a Hips-rooted hierarchy",
    );
  });

  it("rejects unsupported materials and empty model bounds", () => {
    const { scene, root, mesh } = createCompatibleScene();
    mesh.geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3),
    );
    root.add(new Mesh(mesh.geometry, new MeshBasicMaterial()));
    scene.updateMatrixWorld(true);

    const report = validateAvatarScene(scene);

    expect(report.valid).toBe(false);
    expect(findCheck(report, "materials").status).toBe("fail");
    expect(findCheck(report, "bounds").status).toBe("fail");
  });

  it("warns on large textures, triangle counts, and draw-call estimates", () => {
    const { scene } = createCompatibleScene();
    const triangleCount = 100_001;
    const positions = new Float32Array(triangleCount * 9);
    positions[4] = 1.8;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3),
    );
    for (let index = 0; index < 49; index += 1) {
      geometry.addGroup(0, 3, index);
    }
    const materials = Array.from(
      { length: 49 },
      () => new MeshStandardMaterial(),
    );
    const mesh = new Mesh(geometry, materials);
    const texture = new DataTexture(new Uint8Array(16), 4096, 1);
    materials[0]!.map = texture;
    scene.add(mesh);
    scene.updateMatrixWorld(true);

    const report = validateAvatarScene(scene);

    expect(report.valid).toBe(true);
    expect(report.metrics.triangleCount).toBe(triangleCount + 1);
    expect(report.metrics.drawCallEstimate).toBe(50);
    expect(findCheck(report, "textures").status).toBe("warning");
    expect(findCheck(report, "triangles").status).toBe("warning");
    expect(findCheck(report, "draw-calls").status).toBe("warning");
  });

  it("returns named failures instead of accepting non-GLB data", async () => {
    const report = await validateAvatarGlb(
      new Blob([new Uint8Array([1, 2, 3])]),
    );

    expect(report.valid).toBe(false);
    expect(findCheck(report, "glb").status).toBe("fail");
    expect(report.checks.filter((check) => check.status === "skipped")).toHaveLength(7);
  });
});
