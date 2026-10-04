// @vitest-environment jsdom

import m from "mithril";
import { describe, expect, it } from "vitest";
import { positionAvatarCompanionCard } from "./AvatarCompanionCardPosition.js";
import { AvatarConversationCard } from "./AvatarConversationCard.js";

function bounds(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRectReadOnly {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

describe("positionAvatarConversationCard", () => {
  it("places the card beside the avatar on the side opposite its dock", () => {
    const layer = bounds(0, 0, 1000, 700);
    const card = { width: 300, height: 250 };

    const rightDock = positionAvatarCompanionCard(
      layer,
      bounds(800, 350, 180, 300),
      card,
      "right",
    );
    const leftDock = positionAvatarCompanionCard(
      layer,
      bounds(20, 350, 180, 300),
      card,
      "left",
    );

    expect(rightDock).toEqual({ left: 488, top: 400, maxHeight: 250 });
    expect(leftDock).toEqual({ left: 212, top: 400, maxHeight: 250 });
  });

  it("keeps the card below the avatar's face when the desktop is too narrow", () => {
    const layer = bounds(0, 0, 320, 500);
    const avatar = bounds(72, 250, 176, 185);

    const position = positionAvatarCompanionCard(
      layer,
      avatar,
      { width: 284, height: 300 },
      "right",
    );

    expect(position.left).toBe(6);
    expect(position.top).toBeGreaterThanOrEqual(avatar.height * 0.35 + avatar.top);
    expect(position.left + 284).toBeLessThanOrEqual(layer.width - 6);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(
      layer.height - 6,
    );
  });

  it("uses the space above the face before shrinking the card on mobile", () => {
    const layer = bounds(0, 0, 356, 565);
    const position = positionAvatarCompanionCard(
      layer,
      bounds(173, 295, 176, 239),
      { width: 336, height: 385 },
      "right",
    );

    expect(position).toEqual({
      left: 13,
      top: 6,
      maxHeight: 277,
    });
  });

  describe("AvatarConversationCard transcript", () => {
    it("renders live speech recognition text in the accessible transcript", () => {
      const host = document.createElement("div");
      document.body.append(host);

      m.render(
        host,
        m(AvatarConversationCard, {
          userTranscript: "Waar is mijn afspraak?",
          assistantText: "Je afspraak staat morgen om tien uur.",
          onClose: () => undefined,
        }),
      );

      expect(host.querySelector(".avatar-conversation-user-text")?.textContent)
        .toBe("Waar is mijn afspraak?");
      expect(host.querySelector(".avatar-conversation-caption")?.textContent)
        .toBe("Je afspraak staat morgen om tien uur.");
      expect(
        host.querySelector('[aria-live="polite"]')?.textContent,
      ).toContain("Waar is mijn afspraak?");

      m.render(host, null);
    });
  });
});
