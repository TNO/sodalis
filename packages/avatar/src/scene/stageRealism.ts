import {
  ShaderChunk,
  type DirectionalLight,
  type Material,
  type Object3D,
  type Box3,
  Vector3,
} from "three";

const SKIN_MATERIAL = /(?:^|[._])(?:skin|body|head)$/i;

const LAMBERT_LINE =
  "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );";

/**
 * Per-channel wrap lighting: red light bleeds furthest past the terminator,
 * which approximates subsurface scattering in skin without a separate pass.
 */
const SKIN_DIFFUSE = `{
		vec3 skinWrap = vec3( 0.42, 0.2, 0.14 );
		float skinNL = dot( geometryNormal, directLight.direction );
		vec3 skinScatter = saturate( ( vec3( skinNL ) + skinWrap ) / ( 1.0 + skinWrap ) );
		skinScatter *= mix( vec3( 1.0 ), skinScatter, 0.5 );
		reflectedLight.directDiffuse += skinScatter * directLight.color * BRDF_Lambert( material.diffuseColor );
	}`;

export function isSkinMaterial(material: Material): boolean {
  return SKIN_MATERIAL.test(material.name);
}

function applySkinScattering(material: Material): void {
  if (material.userData.sodalisSkin) return;
  material.userData.sodalisSkin = true;
  const physicalChunk = ShaderChunk.lights_physical_pars_fragment;
  if (!physicalChunk?.includes(LAMBERT_LINE)) return;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      physicalChunk.replace(LAMBERT_LINE, SKIN_DIFFUSE),
    );
  };
  material.customProgramCacheKey = () => "sodalis-skin";
  material.needsUpdate = true;
}

function isCutout(material: Material): boolean {
  return material.alphaTest > 0;
}

/**
 * Stage-only material upgrades: soft shadows (not from cards), smooth
 * alpha-to-coverage edges for hair, brows and lashes, and skin scattering.
 * Requires an MSAA renderer for alpha-to-coverage to take effect.
 */
export function enhanceStageAvatar(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    // Hair, brow and lash cards render as solid shells in the shadow pass,
    // casting hard-edged blocks across the face, so they cast no shadow.
    // Cutout cards also self-shadow into dark streaks, so they receive none.
    const card = materials.some((m) => isCutout(m) || m.transparent);
    mesh.castShadow = !card;
    mesh.receiveShadow = !materials.some(isCutout);
    for (const material of materials) {
      if (isCutout(material) && !material.alphaToCoverage) {
        material.alphaToCoverage = true;
        material.needsUpdate = true;
      }
      if (isSkinMaterial(material)) applySkinScattering(material);
    }
  });
}

/** Fits the key light's orthographic shadow frustum tightly around the avatar. */
export function fitShadowCamera(light: DirectionalLight, bounds: Box3): void {
  const center = bounds.getCenter(new Vector3());
  const radius = bounds.getSize(new Vector3()).length() / 2;
  light.target.position.copy(center);
  light.target.updateMatrixWorld();
  const direction = light.position.clone().sub(center).normalize();
  light.position.copy(center).addScaledVector(direction, radius * 3);
  const shadowCamera = light.shadow.camera;
  shadowCamera.left = -radius;
  shadowCamera.right = radius;
  shadowCamera.top = radius;
  shadowCamera.bottom = -radius;
  shadowCamera.near = radius;
  shadowCamera.far = radius * 5;
  shadowCamera.updateProjectionMatrix();
}
