import {
  Box3,
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  ShaderChunk,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { describe, expect, it } from "vitest";
import {
  enhanceStageAvatar,
  fitShadowCamera,
  isSkinMaterial,
} from "./stageRealism.js";

function meshWith(name: string, alphaTest = 0): Mesh {
  const material = new MeshStandardMaterial({ alphaTest });
  material.name = name;
  return new Mesh(new BoxGeometry(), material);
}

describe("stage realism", () => {
  it("recognises skin materials across avatar naming conventions", () => {
    const names = ["Anna_Head", "Anna_Body", "sofia.body", "Wolf3D_Skin"];
    for (const name of names) {
      expect(isSkinMaterial(meshWith(name).material as MeshStandardMaterial))
        .toBe(true);
    }
    for (const name of ["Anna_Eyes", "sofia.high-poly", "Wolf3D_Hair"]) {
      expect(isSkinMaterial(meshWith(name).material as MeshStandardMaterial))
        .toBe(false);
    }
  });

  it("enables shadows, smooth cutouts and skin scattering", () => {
    const root = new Group();
    const skin = meshWith("Anna_Head");
    const hair = meshWith("Anna_Hair", 0.35);
    const eyes = meshWith("Anna_Eyes");
    root.add(skin, hair, eyes);

    enhanceStageAvatar(root);

    for (const mesh of [skin, hair, eyes]) expect(mesh.castShadow).toBe(true);
    expect(skin.receiveShadow).toBe(true);
    expect(hair.receiveShadow).toBe(false);
    const hairMaterial = hair.material as MeshStandardMaterial;
    const eyeMaterial = eyes.material as MeshStandardMaterial;
    expect(hairMaterial.alphaToCoverage).toBe(true);
    expect(eyeMaterial.alphaToCoverage).toBe(false);

    const shader = {
      fragmentShader: "#include <lights_physical_pars_fragment>",
    } as WebGLProgramParametersWithUniforms;
    const skinMaterial = skin.material as MeshStandardMaterial;
    skinMaterial.onBeforeCompile(shader, undefined as never);
    expect(shader.fragmentShader).toContain("skinScatter");
    expect(shader.fragmentShader.length).toBeGreaterThan(
      ShaderChunk.lights_physical_pars_fragment.length,
    );
    expect(skinMaterial.customProgramCacheKey()).toBe("sodalis-skin");
  });

  it("fits the shadow frustum around the avatar", () => {
    const light = new DirectionalLight();
    light.position.set(-1.6, 2.6, 2.4);
    const bounds = new Box3(new Vector3(-0.4, 0, -0.2), new Vector3(0.4, 1.8, 0.2));

    fitShadowCamera(light, bounds);

    const radius = bounds.getSize(new Vector3()).length() / 2;
    expect(light.target.position.toArray()).toEqual([0, 0.9, 0]);
    expect(light.shadow.camera.right).toBeCloseTo(radius);
    expect(light.position.distanceTo(light.target.position)).toBeCloseTo(
      radius * 3,
    );
  });
});
