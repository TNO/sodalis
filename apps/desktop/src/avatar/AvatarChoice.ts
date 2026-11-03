import m from "mithril";
import type { AvatarSelection } from "./avatarCatalogue.js";

export const AvatarChoice: m.Component<{ selection: AvatarSelection }> = {
  view: ({ attrs: { selection } }) => {
    const { attribution } = selection.selected;
    return m("fieldset.avatar-choice", [
      m("legend", "Avatar"),
      m(
        ".avatar-choice-options",
        selection.entries.map((entry) =>
          m("label.avatar-choice-option", [
            m("input[type=radio][name=avatar-choice]", {
              value: entry.asset.id,
              checked: entry === selection.selected,
              onchange: () => selection.select(entry.asset.id),
            }),
            entry.asset.name,
          ]),
        ),
      ),
      m("p.avatar-attribution", [
        "Avatar model: ",
        m(
          "a",
          { href: attribution.sourceUrl, target: "_blank", rel: "noreferrer" },
          attribution.title,
        ),
        " · ",
        m(
          "a",
          { href: attribution.licenseUrl, target: "_blank", rel: "noreferrer" },
          attribution.license,
        ),
      ]),
    ]);
  },
};
