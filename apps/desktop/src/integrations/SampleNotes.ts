import m from "mithril";
import type { createAppIntegrationRegistry } from "@sodalis/app-sdk";

type AppRegistry = ReturnType<typeof createAppIntegrationRegistry>;

export function createSampleNotes(
  registry: AppRegistry,
  setFocused: (focused: boolean) => void,
) {
  let note = "Welcome to Sample Notes.";
  const integration = registry.register({
    id: "sample-notes",
    name: "Sample Notes",
    category: "Productivity",
    actions: [
      {
        id: "sample-notes.read",
        description: "Read the text in the first-party Sample Notes panel.",
        risk: "read",
        requiresConfirmation: false,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: () => note,
      },
      {
        id: "sample-notes.append",
        description: "Append text to the local Sample Notes draft.",
        risk: "draft",
        requiresConfirmation: false,
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", maxLength: 200 } },
          required: ["text"],
          additionalProperties: false,
        },
        execute: (args) => {
          const text = args.text;
          if (typeof text !== "string" || !text.trim() || note.length + text.length > 1000) {
            throw new Error("Sample note text must be non-empty and at most 1000 characters total.");
          }
          note = `${note}\n${text}`;
          m.redraw();
          return "Added text to Sample Notes.";
        },
      },
    ],
  });
  let removeTarget: (() => void) | undefined;
  const Panel: m.Component = {
    view() {
      return m("section.sample-notes[aria-labelledby=sample-notes-title]", {
        onfocusin: () => setFocused(true),
        onfocusout: (event: FocusEvent) => {
          if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
            setFocused(false);
          }
        },
      }, [
        m("h3#sample-notes-title", "Sample Notes"),
        m("p", "A first-party app integration example. Focus the note to offer its semantic actions."),
        m("textarea[aria-label='Sample note']", {
          value: note,
          maxlength: 1000,
          oninput: (event: Event) => {
            note = (event.target as HTMLTextAreaElement).value;
          },
          oncreate(vnode) {
            removeTarget = integration.registerTarget({
              id: "sample-notes.text",
              element: vnode.dom as HTMLTextAreaElement,
              role: "textbox",
              label: "Sample note",
            });
          },
          onremove() { removeTarget?.(); },
        }),
      ]);
    },
  };
  return { Panel, dispose: integration.dispose };
}
