import type { AvatarDockSide } from "./AvatarPresentationController.js";

export interface AvatarCompanionCardPosition {
  left: number;
  top: number;
  maxHeight: number;
}

const CARD_GAP = 12;
const CARD_PADDING = 6;
const FACE_HEIGHT_RATIO = 0.35;

function overlaps(
  first: { left: number; top: number; width: number; height: number },
  second: { left: number; top: number; width: number; height: number },
): boolean {
  return (
    first.left < second.left + second.width &&
    first.left + first.width > second.left &&
    first.top < second.top + second.height &&
    first.top + first.height > second.top
  );
}

export function positionAvatarCompanionCard(
  layer: DOMRectReadOnly,
  avatar: DOMRectReadOnly,
  card: Pick<DOMRectReadOnly, "width" | "height">,
  dock: AvatarDockSide,
): AvatarCompanionCardPosition {
  const width = Math.min(card.width, Math.max(0, layer.width - CARD_PADDING * 2));
  const maximumHeight = Math.min(layer.height * 0.72, 432);
  const avatarBounds = {
    left: avatar.left - layer.left,
    top: avatar.top - layer.top,
    width: avatar.width,
    height: avatar.height,
  };
  const sideCandidates =
    dock === "right"
      ? [
          avatarBounds.left - width - CARD_GAP,
          avatarBounds.left + avatarBounds.width + CARD_GAP,
        ]
      : [
          avatarBounds.left + avatarBounds.width + CARD_GAP,
          avatarBounds.left - width - CARD_GAP,
        ];

  const sideBottom = Math.min(
    avatarBounds.top + avatarBounds.height,
    layer.height - CARD_PADDING,
  );
  for (const left of sideCandidates) {
    const height = Math.min(
      card.height,
      maximumHeight,
      sideBottom - CARD_PADDING,
    );
    const top = sideBottom - height;
    if (
      left >= CARD_PADDING &&
      left + width <= layer.width - CARD_PADDING &&
      height > 0 &&
      !overlaps({ left, top, width, height }, avatarBounds)
    ) {
      return { left, top, maxHeight: height };
    }
  }

  const verticalCandidates = [
    {
      left: avatarBounds.left + avatarBounds.width - width,
      bottom: avatarBounds.top - CARD_GAP,
    },
    {
      left: avatarBounds.left + avatarBounds.width - width,
      top: avatarBounds.top + avatarBounds.height + CARD_GAP,
    },
  ];
  for (const candidate of verticalCandidates) {
    const availableHeight =
      candidate.bottom !== undefined
        ? candidate.bottom - CARD_PADDING
        : layer.height - CARD_PADDING - candidate.top;
    const height = Math.min(card.height, maximumHeight, availableHeight);
    const top =
      candidate.bottom !== undefined
        ? candidate.bottom - height
        : candidate.top;
    if (
      candidate.left >= CARD_PADDING &&
      candidate.left + width <= layer.width - CARD_PADDING &&
      top >= CARD_PADDING &&
      height > 0 &&
      !overlaps({ left: candidate.left, top, width, height }, avatarBounds)
    ) {
      return {
        left: candidate.left,
        top,
        maxHeight: height,
      };
    }
  }

  const faceBottom =
    avatarBounds.top + avatarBounds.height * FACE_HEIGHT_RATIO;
  const top = Math.min(
    Math.max(CARD_PADDING, faceBottom + CARD_GAP),
    Math.max(CARD_PADDING, layer.height - CARD_PADDING - 80),
  );
  const preferredLeft =
    dock === "right"
      ? avatarBounds.left - width - CARD_GAP
      : avatarBounds.left + avatarBounds.width + CARD_GAP;
  return {
    left: Math.max(
      CARD_PADDING,
      Math.min(preferredLeft, layer.width - width - CARD_PADDING),
    ),
    top,
    maxHeight: Math.max(80, layer.height - top - CARD_PADDING),
  };
}
