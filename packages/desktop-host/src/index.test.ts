import { afterEach, describe, expect, it, vi } from "vitest";
import { createAsterDesktopHost } from "./index.js";

describe("Aster desktop host", () => {
  let iframe: HTMLIFrameElement | undefined;

  afterEach(() => {
    iframe?.remove();
    iframe = undefined;
  });

  function connect(runtime: object) {
    iframe = document.createElement("iframe");
    document.body.append(iframe);
    Object.defineProperty(iframe.contentWindow, "Aster", { value: runtime });
    return createAsterDesktopHost(iframe);
  }

  it("lists only visible built-in applications", async () => {
    const host = connect({
      booted: true,
      ready: Promise.resolve(),
      apps: new Map([
        ["mail", { id: "mail", title: "Mail", category: "Productivity" }],
        ["settings", { id: "settings", title: "Settings", hidden: true }],
        ["web", { id: "web", title: "Untrusted web app", webApp: true }],
        ["system", { id: "system", title: "System feature", systemFeature: true }],
        ["custom", { id: "custom", title: "Imported app", custom: true }],
      ]),
      openApp: vi.fn(),
    });

    await expect(host.listApplications()).resolves.toEqual([
      { id: "mail", title: "Mail", category: "Productivity" },
    ]);
  });

  it("waits for Aster and the app window before reporting a launch", async () => {
    let markWindowReady!: () => void;
    const windowReady = new Promise<void>((resolve) => {
      markWindowReady = resolve;
    });
    const openApp = vi.fn(() => ({
      ready: windowReady,
      body: document.createElement("div"),
    }));
    const host = connect({
      booted: true,
      ready: Promise.resolve(),
      apps: new Map([["settings", { id: "settings", title: "Settings" }]]),
      openApp,
    });

    const launch = host.openApplication("settings");
    await vi.waitFor(() => expect(openApp).toHaveBeenCalledWith("settings"));
    let completed = false;
    void launch.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    markWindowReady();
    await expect(launch).resolves.toBeUndefined();
  });

  it("rejects unavailable applications rather than forwarding them to Aster", async () => {
    const openApp = vi.fn();
    const host = connect({
      booted: true,
      ready: Promise.resolve(),
      apps: new Map([
        ["web", { id: "web", title: "Untrusted web app", webApp: true }],
      ]),
      openApp,
    });

    await expect(host.openApplication("web")).rejects.toThrow(
      'Application "web" is not available to the desktop host.',
    );
    expect(openApp).not.toHaveBeenCalled();
  });
});
