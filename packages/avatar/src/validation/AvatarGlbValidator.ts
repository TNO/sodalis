import {
  Box3,
  Bone,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  Texture,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  AVATAR_ARKIT_SHAPES,
  AVATAR_MAX_DRAW_CALLS,
  AVATAR_MAX_TEXTURE_DIMENSION,
  AVATAR_MAX_TRIANGLES,
  AVATAR_REQUIRED_BONES,
  AVATAR_VISEMES,
} from "../index.js";

export type AvatarGlbCheckStatus = "pass" | "warning" | "fail" | "skipped";

export interface AvatarGlbValidationCheck {
  id: string;
  name: string;
  status: AvatarGlbCheckStatus;
  message: string;
}

export interface AvatarGlbValidationMetrics {
  skinnedMeshCount: number;
  boneCount: number;
  arkitShapeCount: number;
  visemeCount: number;
  materialCount: number;
  textureCount: number;
  largestTextureDimension: number;
  triangleCount: number;
  drawCallEstimate: number;
  bounds: { width: number; height: number; depth: number } | null;
}

export interface AvatarGlbValidationReport {
  valid: boolean;
  checks: AvatarGlbValidationCheck[];
  metrics: AvatarGlbValidationMetrics;
}

function check(
  id: string,
  name: string,
  status: AvatarGlbCheckStatus,
  message: string,
): AvatarGlbValidationCheck {
  return { id, name, status, message };
}

function emptyMetrics(): AvatarGlbValidationMetrics {
  return {
    skinnedMeshCount: 0,
    boneCount: 0,
    arkitShapeCount: 0,
    visemeCount: 0,
    materialCount: 0,
    textureCount: 0,
    largestTextureDimension: 0,
    triangleCount: 0,
    drawCallEstimate: 0,
    bounds: null,
  };
}

function isVisible(object: Object3D): boolean {
  for (let parent: Object3D | null = object; parent; parent = parent.parent) {
    if (!parent.visible) return false;
  }
  return true;
}

function hasValidSkinAttributes(mesh: SkinnedMesh): boolean {
  const position = mesh.geometry.getAttribute("position");
  const skinIndex = mesh.geometry.getAttribute("skinIndex");
  const skinWeight = mesh.geometry.getAttribute("skinWeight");
  return (
    position !== undefined &&
    skinIndex !== undefined &&
    skinWeight !== undefined &&
    skinIndex.itemSize === 4 &&
    skinWeight.itemSize === 4 &&
    skinIndex.count === position.count &&
    skinWeight.count === position.count
  );
}

function hasRequiredBoneHierarchy(bones: readonly Bone[]): boolean {
  const bonesByName = new Map(bones.map((bone) => [bone.name, bone]));
  const hips = bonesByName.get(AVATAR_REQUIRED_BONES[0]);
  if (!hips || hips.parent instanceof Bone) return false;

  let previous = hips;
  for (const name of AVATAR_REQUIRED_BONES.slice(1)) {
    const bone = bonesByName.get(name);
    if (!bone) return false;

    let ancestor = bone.parent;
    while (ancestor && ancestor !== previous) ancestor = ancestor.parent;
    if (ancestor !== previous) return false;
    previous = bone;
  }
  return true;
}

function expandBounds(bounds: Box3, mesh: Mesh): void {
  if (mesh instanceof SkinnedMesh && !hasValidSkinAttributes(mesh)) {
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      bounds.union(
        mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
      );
    }
    return;
  }
  bounds.expandByObject(mesh);
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter(
    (value): value is Texture => value instanceof Texture,
  );
}

function textureDimension(texture: Texture): number | undefined {
  const image = texture.image as
    | {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
        videoWidth?: number;
        videoHeight?: number;
      }
    | undefined;
  if (!image) return undefined;

  const width = image.width ?? image.naturalWidth ?? image.videoWidth;
  const height = image.height ?? image.naturalHeight ?? image.videoHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  return Math.max(width ?? 0, height ?? 0);
}

function disposeSceneResources(scene: Object3D): void {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of materialsOf(object)) {
      materials.add(material);
      for (const texture of texturesOf(material)) textures.add(texture);
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function validationFailure(message: string): AvatarGlbValidationReport {
  return {
    valid: false,
    checks: [
      check("glb", "Binary GLB container", "fail", message),
      check(
        "rig",
        "Humanoid rig and root",
        "skipped",
        "Not inspected because the GLB could not be parsed.",
      ),
      check(
        "morphs",
        "ARKit and Oculus morph targets",
        "skipped",
        "Not inspected because the GLB could not be parsed.",
      ),
      check(
        "materials",
        "Core PBR materials",
        "skipped",
        "Not inspected because the GLB could not be parsed.",
      ),
      check(
        "textures",
        "Texture dimensions",
        "skipped",
        "Not inspected because the GLB could not be parsed.",
      ),
      check(
        "triangles",
        "Triangle budget",
        "skipped",
        "Not inspected because the GLB could not be parsed.",
      ),
      check(
        "draw-calls",
        "Draw-call estimate",
        "skipped",
        "Not inspected because the GLB could not be parsed.",
      ),
      check(
        "bounds",
        "Model bounds",
        "skipped",
        "Not inspected because the GLB could not be parsed.",
      ),
    ],
    metrics: emptyMetrics(),
  };
}

export function validateAvatarScene(
  scene: Object3D,
): AvatarGlbValidationReport {
  scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh && isVisible(object)) meshes.push(object);
  });
  const skinnedMeshes = meshes.filter(
    (mesh): mesh is SkinnedMesh => mesh instanceof SkinnedMesh,
  );
  const invalidSkinMeshes = skinnedMeshes.filter(
    (mesh) => !hasValidSkinAttributes(mesh),
  );
  const bones = new Map<string, Bone>();
  scene.traverse((object) => {
    if (object instanceof Bone && object.name) bones.set(object.name, object);
  });

  const morphs = new Set<string>();
  for (const mesh of meshes) {
    for (const name of Object.keys(mesh.morphTargetDictionary ?? {})) {
      morphs.add(name);
    }
  }
  const missingBones = AVATAR_REQUIRED_BONES.filter((name) => !bones.has(name));
  const hasBoundHumanoidRig = skinnedMeshes.some((mesh) =>
    hasRequiredBoneHierarchy(mesh.skeleton.bones),
  );
  const missingMorphs = [...AVATAR_ARKIT_SHAPES, ...AVATAR_VISEMES].filter(
    (name) => !morphs.has(name),
  );

  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  let unsupportedMaterials = 0;
  let largestTextureDimension = 0;
  let unknownTextureDimensions = 0;
  let triangleCount = 0;
  let drawCallEstimate = 0;
  let meshesWithoutPositions = 0;
  const bounds = new Box3().makeEmpty();

  for (const mesh of meshes) {
    expandBounds(bounds, mesh);
    const position = mesh.geometry.getAttribute("position");
    const elementCount = mesh.geometry.index?.count ?? position?.count;
    if (elementCount === undefined) meshesWithoutPositions += 1;
    else triangleCount += Math.floor(elementCount / 3);

    drawCallEstimate +=
      mesh.geometry.groups.length ||
      (Array.isArray(mesh.material) ? mesh.material.length : 1);

    for (const material of materialsOf(mesh)) {
      materials.add(material);
      if (!(material instanceof MeshStandardMaterial)) {
        unsupportedMaterials += 1;
      }
      for (const texture of texturesOf(material)) {
        textures.add(texture);
        const dimension = textureDimension(texture);
        if (dimension === undefined) unknownTextureDimensions += 1;
        else largestTextureDimension = Math.max(largestTextureDimension, dimension);
      }
    }
  }

  const size = bounds.getSize(new Vector3());
  const hasFiniteBounds = [
    bounds.min.x,
    bounds.min.y,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z,
    size.x,
    size.y,
    size.z,
  ].every(Number.isFinite);
  const metrics: AvatarGlbValidationMetrics = {
    skinnedMeshCount: skinnedMeshes.length,
    boneCount: bones.size,
    arkitShapeCount: AVATAR_ARKIT_SHAPES.filter((name) => morphs.has(name))
      .length,
    visemeCount: AVATAR_VISEMES.filter((name) => morphs.has(name)).length,
    materialCount: materials.size,
    textureCount: textures.size,
    largestTextureDimension,
    triangleCount,
    drawCallEstimate,
    bounds:
      bounds.isEmpty() || !hasFiniteBounds
        ? null
        : { width: size.x, height: size.y, depth: size.z },
  };

  const rigValid =
    skinnedMeshes.length > 0 &&
    hasBoundHumanoidRig &&
    invalidSkinMeshes.length === 0;
  const morphsValid = missingMorphs.length === 0;
  const materialsValid =
    meshes.length > 0 && materials.size > 0 && unsupportedMaterials === 0;
  const textureStatus =
    largestTextureDimension > AVATAR_MAX_TEXTURE_DIMENSION ||
    unknownTextureDimensions > 0
      ? "warning"
      : "pass";
  const geometryValid = meshes.length > 0 && meshesWithoutPositions === 0;
  const trianglesStatus = !geometryValid
    ? "fail"
    : triangleCount > AVATAR_MAX_TRIANGLES
      ? "warning"
      : "pass";
  const drawCallsStatus =
    meshes.length === 0
      ? "fail"
      : drawCallEstimate > AVATAR_MAX_DRAW_CALLS
        ? "warning"
        : "pass";
  const boundsStatus =
    bounds.isEmpty() || !hasFiniteBounds || size.y <= 0
      ? "fail"
      : size.y < 0.5 || size.y > 3
        ? "warning"
        : "pass";

  const checks = [
    check(
      "rig",
      "Humanoid rig and root",
      rigValid ? "pass" : "fail",
      rigValid
        ? `Found a skinned mesh and the Hips root with ${AVATAR_REQUIRED_BONES.length - 1} core spine/head joints.`
        : skinnedMeshes.length === 0
          ? "No visible skinned mesh or humanoid skeleton was found."
          : [
              ...(!hasBoundHumanoidRig && missingBones.length === 0
                ? [
                    "Required humanoid joints are not connected in a Hips-rooted hierarchy on one skinned mesh.",
                  ]
                : []),
              ...(missingBones.length > 0
                ? [`Missing required humanoid joints: ${missingBones.join(", ")}.`]
                : []),
              ...(invalidSkinMeshes.length > 0
                ? [`${invalidSkinMeshes.length} skinned mesh(es) have missing or mismatched skinIndex/skinWeight attributes.`]
                : []),
            ].join(" "),
    ),
    check(
      "morphs",
      "ARKit and Oculus morph targets",
      morphsValid ? "pass" : "fail",
      morphsValid
        ? `Found all ${AVATAR_ARKIT_SHAPES.length} ARKit face units and ${AVATAR_VISEMES.length} Oculus visemes.`
        : `Missing required morph targets: ${missingMorphs.join(", ")}.`,
    ),
    check(
      "materials",
      "Core PBR materials",
      materialsValid ? "pass" : "fail",
      materialsValid
        ? `Found ${materials.size} MeshStandard/Physical material(s).`
        : meshes.length === 0
          ? "No visible mesh materials were found."
          : materials.size === 0
            ? "Visible meshes have no material."
            : `${unsupportedMaterials} material(s) are not glTF core PBR MeshStandard/Physical materials.`,
    ),
    check(
      "textures",
      "Texture dimensions",
      textureStatus,
      textures.size === 0
        ? "No texture maps found; solid-color PBR materials are allowed."
        : `${textures.size} texture(s); largest dimension ${largestTextureDimension}px (recommended maximum ${AVATAR_MAX_TEXTURE_DIMENSION}px).${unknownTextureDimensions ? ` ${unknownTextureDimensions} texture dimension(s) could not be measured.` : ""}`,
    ),
    check(
      "triangles",
      "Triangle budget",
      trianglesStatus,
      !geometryValid
        ? `${meshesWithoutPositions} visible mesh(es) have no position geometry.`
        : `${triangleCount.toLocaleString()} triangle(s); recommended maximum ${AVATAR_MAX_TRIANGLES.toLocaleString()}.`,
    ),
    check(
      "draw-calls",
      "Draw-call estimate",
      drawCallsStatus,
      meshes.length === 0
        ? "No visible mesh geometry was found."
        : `${drawCallEstimate} estimated draw call(s); recommended maximum ${AVATAR_MAX_DRAW_CALLS}.`,
    ),
    check(
      "bounds",
      "Model bounds",
      boundsStatus,
      !metrics.bounds
        ? "Visible model bounds are empty or non-finite."
        : boundsStatus === "warning"
          ? `Measured ${size.y.toFixed(2)}m high; expected range is 0.5–3m.`
          : `Measured ${size.x.toFixed(2)}m × ${size.y.toFixed(2)}m × ${size.z.toFixed(2)}m.`,
    ),
  ];

  return {
    valid: checks.every((item) => item.status === "pass" || item.status === "warning"),
    checks,
    metrics,
  };
}

export async function validateAvatarGlb(
  file: Blob,
): Promise<AvatarGlbValidationReport> {
  try {
    const data = await file.arrayBuffer();
    if (
      data.byteLength < 12 ||
      new DataView(data).getUint32(0, true) !== 0x46546c67
    ) {
      return validationFailure(
        "File does not start with a binary glTF (glTF) header.",
      );
    }

    const gltf = await new GLTFLoader().parseAsync(data, "");
    try {
      const report = validateAvatarScene(gltf.scene);
      return {
        ...report,
        checks: [
          check(
            "glb",
            "Binary GLB container",
            "pass",
            "The binary glTF parsed successfully.",
          ),
          ...report.checks,
        ],
      };
    } finally {
      disposeSceneResources(gltf.scene);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return validationFailure(`Could not parse GLB: ${message}`);
  }
}
