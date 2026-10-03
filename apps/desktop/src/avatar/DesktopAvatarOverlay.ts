import m from "mithril";
import type { Vnode } from "mithril";
import type { AvatarUiTargetRegistry } from "@sodalis/avatar";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import { AvatarViewport } from "./AvatarViewport.js";

interface DesktopAvatarOverlayAttrs {
  targetRegistry?: AvatarUiTargetRegistry;
  onScene?: (scene: AvatarSceneHandle | undefined) => void;
  gazeOverlay?: string;
}

export const DesktopAvatarOverlay = (): m.Component<DesktopAvatarOverlayAttrs> => ({
  view(vnode: Vnode<DesktopAvatarOverlayAttrs>) {
    return m(
      ".desktop-avatar-layer",
      {
        role: "group",
        "aria-label": "Desktop companion",
      },
      m(AvatarViewport, vnode.attrs),
    );
  },
});
