export interface DesktopApplication {
  id: string;
  title: string;
  category?: string;
}

export interface DesktopHost {
  listApplications(): Promise<DesktopApplication[]>;
  openApplication(appId: string): Promise<void>;
}

interface AsterApplication extends DesktopApplication {
  hidden?: boolean;
  systemFeature?: boolean;
  webApp?: boolean;
  custom?: boolean;
}

interface AsterWindowHandle {
  ready?: Promise<unknown>;
  body?: Pick<HTMLElement, "querySelector">;
}

interface AsterRuntime {
  booted: boolean;
  ready: Promise<unknown>;
  apps: Map<string, AsterApplication>;
  openApp(
    appId: string,
  ):
    | AsterWindowHandle
    | null
    | Promise<AsterWindowHandle | null>;
}

interface AsterFrameWindow extends Window {
  Aster?: AsterRuntime;
}

function getRuntime(frame: HTMLIFrameElement): AsterRuntime {
  const runtime = (frame.contentWindow as AsterFrameWindow | null)?.Aster;
  if (!runtime) {
    throw new Error("Aster desktop is not available in the desktop frame.");
  }
  return runtime;
}

async function readyRuntime(frame: HTMLIFrameElement): Promise<AsterRuntime> {
  const runtime = getRuntime(frame);
  await runtime.ready;
  if (!runtime.booted) {
    throw new Error("Aster desktop did not finish starting.");
  }
  return runtime;
}

function isAvailableApplication(
  app: AsterApplication | undefined,
): app is AsterApplication {
  return Boolean(
    app &&
      !app.hidden &&
      !app.systemFeature &&
      !app.webApp &&
      !app.custom,
  );
}

export function createAsterDesktopHost(frame: HTMLIFrameElement): DesktopHost {
  return {
    async listApplications() {
      const runtime = await readyRuntime(frame);
      return Array.from(runtime.apps.values())
        .filter(isAvailableApplication)
        .map(({ id, title, category }) => ({
          id,
          title,
          ...(category ? { category } : {}),
        }));
    },

    async openApplication(appId) {
      const runtime = await readyRuntime(frame);
      if (!isAvailableApplication(runtime.apps.get(appId))) {
        throw new Error(
          `Application "${appId}" is not available to the desktop host.`,
        );
      }

      const appWindow = await runtime.openApp(appId);
      if (!appWindow) {
        throw new Error(`Aster could not open application "${appId}".`);
      }

      await appWindow.ready;
      if (appWindow.body?.querySelector(".app-error")) {
        throw new Error(`Aster could not start application "${appId}".`);
      }
    },
  };
}
