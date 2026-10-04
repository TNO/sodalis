// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAttentionTargetRegistry,
  type AvatarController,
} from "@sodalis/avatar";
import { createAttentionManager } from "../avatar/AttentionManager.js";
import { createAvatarPresentationController } from "../avatar/AvatarPresentationController.js";
import type { DesktopHost } from "@sodalis/desktop-host";
import { MockMailApplication } from "./MockMailApplication.js";
import { createDesktopAssistantActionRuntime } from "./createDesktopAssistantActions.js";

describe("desktop assistant actions", () => {
  afterEach(() => document.body.replaceChildren());

  it("provides semantic mock Mail list, search, open, read, and draft actions", async () => {
    const mail = new MockMailApplication();
    const attention = createAttentionManager({
      registry: createAttentionTargetRegistry(),
      presentation: createAvatarPresentationController({
        storage: { getItem: () => null, setItem: vi.fn() },
      }),
      getAvatarController: () => undefined,
    });
    const actions = createDesktopAssistantActionRuntime({
      getHost: () => undefined,
      attention,
      mail,
    });

    const list = await actions.invoke({
      id: "mail.list-messages",
      arguments: {},
    });
    const search = await actions.invoke({
      id: "mail.search-messages",
      arguments: { query: "invoice" },
    });
    const open = await actions.invoke({
      id: "mail.open-message",
      arguments: { messageId: "mail-anne-project" },
    });
    const select = await actions.invoke({
      id: "mail.select-message",
      arguments: { messageId: "mail-anne-project" },
    });
    const read = await actions.invoke({
      id: "mail.read-message",
      arguments: { messageId: "mail-anne-project" },
    });
    const draft = await actions.invoke({
      id: "mail.create-draft",
      arguments: {
        to: "anne@example.test",
        subject: "Thursday",
        body: "Can we meet Thursday?",
      },
    });

    expect(list.message).toContain("mail-anne-project");
    expect(search.message).toContain("Your sample invoice");
    expect(open.message).toContain("Opened");
    expect(select.message).toContain("Selected");
    expect(read.message).toContain("review the project timeline");
    expect(draft.message).toContain("Created draft draft-1");
    expect(mail.getDrafts()).toHaveLength(1);
    expect(mail.getSentMessages()).toHaveLength(0);
  });

  it("requires confirmation before mock send and invalidates stale confirmations", async () => {
    const mail = new MockMailApplication();
    const attention = createAttentionManager({
      registry: createAttentionTargetRegistry(),
      presentation: createAvatarPresentationController({
        storage: { getItem: () => null, setItem: vi.fn() },
      }),
      getAvatarController: () => undefined,
    });
    const actions = createDesktopAssistantActionRuntime({
      getHost: () => undefined,
      attention,
      mail,
    });
    const arguments_ = {
      to: "anne@example.test",
      subject: "Thursday",
      body: "Can we meet Thursday?",
    };

    const pending = await actions.invoke({
      id: "mail.send",
      arguments: arguments_,
    });
    if (pending.status !== "confirmation-required") {
      throw new Error("Mock send should require confirmation.");
    }
    expect(mail.getSentMessages()).toHaveLength(0);

    await actions.respondToConfirmation("yes");
    await expect(actions.confirm(pending.pending.id)).rejects.toThrow(
      "No matching action confirmation is pending.",
    );
    expect(mail.getSentMessages()).toHaveLength(0);

    const nextPending = await actions.invoke({
      id: "mail.send",
      arguments: arguments_,
    });
    if (nextPending.status !== "confirmation-required") {
      throw new Error("Mock send should require confirmation.");
    }
    await expect(actions.respondToConfirmation("confirm send")).resolves.toMatchObject({
      status: "completed",
      message: expect.stringContaining("Sent mock message"),
    });
    expect(mail.getSentMessages()).toEqual([
      { id: "sent-1", ...arguments_ },
    ]);
  });

  it("discovers visible semantic targets and opens only trusted desktop apps", async () => {
    const registry = createAttentionTargetRegistry();
    const element = document.createElement("button");
    document.body.append(element);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(20, 30, 100, 40),
    );
    registry.register({
      id: "mail.reply",
      appId: "mail",
      element,
      role: "button",
      label: "Reply",
    });
    const controller: AvatarController = {
      load: vi.fn(async () => undefined),
      unload: vi.fn(async () => undefined),
      setState: vi.fn(),
      setAffect: vi.fn(),
      lookAt: vi.fn(),
      resetGaze: vi.fn(),
      playGesture: vi.fn(async () => undefined),
      setViseme: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const attention = createAttentionManager({
      registry,
      presentation: createAvatarPresentationController({
        storage: { getItem: () => null, setItem: vi.fn() },
      }),
      getAvatarController: () => controller,
    });
    const host: DesktopHost = {
      listApplications: async () => [
        { id: "mail", title: "Mail", category: "Productivity" },
      ],
      getCurrentAppContext: async () => undefined,
      openApplication: vi.fn(async () => undefined),
    };
    const actions = createDesktopAssistantActionRuntime({
      getHost: () => host,
      attention,
    });

    expect(
      actions.getAvailableActions().find((action) => action.id === "desktop.focus-target")
        ?.inputSchema.properties.targetId?.enum,
    ).toEqual(["mail.reply"]);
    await expect(
      actions.invoke({
        id: "desktop.focus-target",
        arguments: { targetId: "mail.reply" },
      }),
    ).resolves.toMatchObject({ status: "completed" });
    expect(controller.lookAt).toHaveBeenCalledWith({
      type: "ui-element",
      id: "mail.reply",
    });
    await actions.invoke({
      id: "desktop.open-app",
      arguments: { appId: "mail" },
    });
    expect(host.openApplication).toHaveBeenCalledWith("mail");
    await expect(
      actions.invoke({
        id: "desktop.open-app",
        arguments: { appId: "untrusted" },
      }),
    ).rejects.toThrow('Application "untrusted" is not available.');
  });

  it("bounds discovered target descriptions to the assistant request limits", () => {
    const registry = createAttentionTargetRegistry();
    const elements: HTMLButtonElement[] = [];
    for (let index = 0; index < 20; index += 1) {
      const element = document.createElement("button");
      elements.push(element);
      document.body.append(element);
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
        new DOMRect(20, 30, 100, 40),
      );
      registry.register({
        id: `mail.action-${index}`,
        appId: "mail",
        element,
        role: "button",
        label: `Reply action ${index} ${"with a long label ".repeat(10)}`.trimEnd(),
      });
    }
    const attention = createAttentionManager({
      registry,
      presentation: createAvatarPresentationController({
        storage: { getItem: () => null, setItem: vi.fn() },
      }),
      getAvatarController: () => undefined,
    });
    const actions = createDesktopAssistantActionRuntime({
      getHost: () => undefined,
      attention,
    });

    const focus = actions
      .getAvailableActions()
      .find((action) => action.id === "desktop.focus-target");
    const description = focus?.description ?? "";
    const targetIds = focus?.inputSchema.properties.targetId?.enum;

    expect(description.length).toBeLessThanOrEqual(950);
    expect(Array.isArray(targetIds)).toBe(true);
    expect(targetIds).toEqual(expect.arrayContaining(["mail.action-0"]));
    expect(targetIds?.length).toBeLessThan(elements.length);
    for (const targetId of targetIds ?? []) {
      expect(description).toContain(targetId);
    }
  });
});
