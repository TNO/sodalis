import type { AvatarFramingName } from "../index.js";

/** World-space heights (metres) of the profile skeleton's landmark joints. */
export interface FramingLandmarks {
  /** Top of the avatar, including hair. */
  top: number;
  /** Bottom of the avatar bounds. */
  bottom: number;
  eye?: number;
  neck?: number;
  /** Upper-arm joint (`LeftArm`): the shoulder line. */
  shoulder?: number;
  /** `Spine2`: upper chest. */
  chest?: number;
  /** `Spine1`: below the chest. */
  spine1?: number;
  /** `Spine`: around the navel. */
  spine?: number;
  hips?: number;
  /** `LeftLeg`: the knee. */
  knee?: number;
  /** `LeftFoot`: the ankle. */
  foot?: number;
}

export interface FramingSpan {
  /** Upper edge of the visible area. */
  top: number;
  /** Lower edge of the visible area. */
  bottom: number;
  /** Width the frame should keep visible when the viewport is narrow. */
  width: number;
}

const FIELD_OF_VIEW: Record<AvatarFramingName, number> = {
  face: 18,
  head: 20,
  "head-shoulders": 24,
  bust: 26,
  "half-body": 30,
  "three-quarter": 34,
  "full-body": 38,
};

/** Fallback landmarks as a fraction of the avatar's height, for skeletons without the profile joints. */
const HEIGHT_FRACTIONS = {
  eye: 0.93,
  neck: 0.84,
  shoulder: 0.81,
  chest: 0.76,
  spine1: 0.68,
  spine: 0.61,
  hips: 0.56,
  knee: 0.29,
  foot: 0.05,
} as const;

export function framingFieldOfView(framing: AvatarFramingName): number {
  const fov = FIELD_OF_VIEW[framing];
  if (fov === undefined) {
    throw new RangeError(`Unknown avatar framing "${framing}".`);
  }
  return fov;
}

/**
 * Returns the vertical slice of the avatar a framing shows, anchored to anatomy
 * (eyes, chin, shoulders, chest, waist, knees, soles) rather than fractions of
 * the bounding box, which hair, A-pose arms, and accessories distort.
 */
export function framingSpan(
  framing: AvatarFramingName,
  landmarks: FramingLandmarks,
): FramingSpan {
  framingFieldOfView(framing);
  const height = Math.max(0.01, landmarks.top - landmarks.bottom);
  const at = (key: keyof typeof HEIGHT_FRACTIONS) =>
    landmarks[key] ?? landmarks.bottom + height * HEIGHT_FRACTIONS[key];

  const eye = at("eye");
  // The crown sits roughly as far above the eyes as the chin sits below them;
  // bounds that reach far higher (a hat, a raised hand) are ignored.
  const crownHeight = Math.min(
    Math.max(landmarks.top - eye, 0.08),
    Math.max(eye - at("neck"), 0.1),
  );
  const crown = eye + crownHeight;
  const chin = eye - crownHeight * 0.9;
  const sole = Math.max(landmarks.bottom, at("foot") - 0.13);
  const waist = (at("spine") + at("hips")) / 2;

  const spans: Record<AvatarFramingName, [number, number, number]> = {
    face: [eye + crownHeight * 0.55, chin - crownHeight * 0.08, 0.8],
    head: [crown + crownHeight * 0.1, chin - crownHeight * 0.2, 0.9],
    "head-shoulders": [
      crown + crownHeight * 0.12,
      at("shoulder") - crownHeight * 0.55,
      1.3,
    ],
    bust: [
      crown + crownHeight * 0.12,
      at("spine1") + (at("chest") - at("spine1")) * 0.2,
      1.1,
    ],
    "half-body": [crown + crownHeight * 0.15, waist - crownHeight * 0.2, 0.9],
    "three-quarter": [
      crown + crownHeight * 0.2,
      at("knee") - crownHeight * 0.4,
      0.7,
    ],
    "full-body": [crown + crownHeight * 0.25, sole - crownHeight * 0.2, 0.6],
  };
  const [top, bottom, widthRatio] = spans[framing];
  return { top, bottom, width: (top - bottom) * widthRatio };
}
