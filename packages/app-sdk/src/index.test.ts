// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createAssistantActionRuntime } from "@sodalis/assistant";
import { createAppIntegrationRegistry, createSodalisAppApi } from "./index.js";

describe("first-party app integration registry", () => {
  const read = vi.fn(() => "One note.");
  const notes = {
    id: "sample-notes",
    name: "Sample Notes",
    actions: [{
      id: "sample-notes.read",
      description: "Read the current sample note.",
      risk: "read" as const,
      requiresConfirmation: false,
      inputSchema: { type: "object" as const, properties: {}, additionalProperties: false },
      execute: read,
    }],
  };

  it("offers only focused actions plus explicitly global actions, and removes actions on dispose", async () => {
    let focused: string | undefined;
    const registry = createAppIntegrationRegistry({
      attention: { register: () => () => {} },
      getFocusedAppId: () => focused,
      getHost: () => undefined,
    });
    const registered = registry.register(notes);
    registry.register({
      id: "global-tools", name: "Global Tools",
      actions: [{
        ...notes.actions[0]!, id: "global-tools.help", scope: "global",
      }],
    });
    const runtime = createAssistantActionRuntime(() => registry.getAvailableActions());
    expect(runtime.getAvailableActions().map((action) => action.id)).toEqual(["global-tools.help"]);
    await expect(runtime.invoke({ id: "sample-notes.read", arguments: {} }))
      .rejects.toThrow("not available");
    focused = "sample-notes";
    expect(runtime.getAvailableActions().map((action) => action.id))
      .toEqual(["sample-notes.read", "global-tools.help"]);
    expect((await runtime.invoke({ id: "sample-notes.read", arguments: {} })).message).toBe("One note.");
    registered.dispose();
    expect(runtime.getAvailableActions().map((action) => action.id)).toEqual(["global-tools.help"]);
  });

  it("rejects duplicate, malformed, or foreign action registrations", () => {
    const registry = createAppIntegrationRegistry({
      attention: { register: () => () => {} },
      getFocusedAppId: () => undefined,
      getHost: () => undefined,
    });
    registry.register(notes);
    expect(() => registry.register(notes)).toThrow("already registered");
    expect(() => registry.register({ ...notes, id: "other-app" })).toThrow("must belong");
    expect(() => registry.register({
      ...notes, id: "bad id", actions: [],
    })).toThrow("invalid");
    expect(() => registry.register({
      ...notes, id: "another-app",
      actions: [
        { ...notes.actions[0]!, id: "another-app.read" },
        { ...notes.actions[0]!, id: "another-app.read" },
      ],
    })).toThrow("more than once");
  });

  it("registers and unregisters only its own semantic UI targets", () => {
    const unregister = vi.fn();
    const register = vi.fn(() => unregister);
    const registry = createAppIntegrationRegistry({
      attention: { register },
      getFocusedAppId: () => undefined,
      getHost: () => undefined,
    });
    const integration = registry.register(notes);
    const button = document.createElement("button");
    const remove = integration.registerTarget({
      id: "sample-notes.open", element: button, role: "button", label: "Open note",
    });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: "sample-notes.open", appId: "sample-notes", element: button,
    }));
    remove();
    integration.dispose();
    expect(unregister).toHaveBeenCalledOnce();
    expect(() => integration.registerTarget({
      id: "sample-notes.other", element: button, role: "button", label: "Other",
    })).toThrow("unregistered");
  });

  it("uses fixed same-origin Sodalis APIs and surfaces backend errors", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ error: "Home Assistant is unavailable." }, { status: 502 }));
    const api = createSodalisAppApi(fetcher as typeof fetch);
    await expect(api.getHomeEntities("bed light")).rejects.toThrow("Home Assistant is unavailable.");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/home/entities?q=bed%20light");
    await expect(api.invokeHomeAction("home.light.turn-on", {
      entityId: "light.bed_light",
    })).rejects.toThrow("Home Assistant is unavailable.");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/home/actions");
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({
      id: "home.light.turn-on",
      arguments: { entityId: "light.bed_light" },
    }));
  });

  it("does not execute a pending action after its integration is unregistered", async () => {
    const execute = vi.fn(async () => "Changed.");
    const registry = createAppIntegrationRegistry({
      attention: { register: () => () => {} },
      getFocusedAppId: () => "sample-notes",
      getHost: () => undefined,
    });
    const registration = registry.register({
      id: "sample-notes", name: "Sample Notes",
      actions: [{
        id: "sample-notes.publish", description: "Publish a sample note.",
        risk: "external-effect", requiresConfirmation: true,
        confirmationPhrase: "confirm publish",
        confirmationSummary: () => "Publish sample note?",
        inputSchema: { type: "object", properties: {} },
        execute,
      }],
    });
    const runtime = createAssistantActionRuntime(() => registry.getAvailableActions());
    const pending = await runtime.invoke({ id: "sample-notes.publish", arguments: {} });
    if (pending.status !== "confirmation-required") throw new Error("Expected confirmation.");
    registration.dispose();
    await expect(runtime.confirm(pending.pending.id)).rejects.toThrow("unregistered");
    expect(execute).not.toHaveBeenCalled();
  });
});
