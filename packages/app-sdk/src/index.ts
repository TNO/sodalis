import {
  createAssistantActionRuntime,
  type AppActionDefinition,
} from "@sodalis/assistant";
import type { AttentionTargetRegistration } from "@sodalis/avatar";
import type { DesktopHost } from "@sodalis/desktop-host";

export interface SodalisAppApi {
  getHomeEntities(query?: string): Promise<unknown>;
  invokeHomeAction(id: string, arguments_: Readonly<Record<string, unknown>>): Promise<unknown>;
  confirmHomeAction(confirmationId: string): Promise<unknown>;
}

export function createSodalisAppApi(fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): SodalisAppApi {
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetcher(path, init);
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message = typeof payload === "object" && payload !== null &&
        "error" in payload && typeof payload.error === "string"
        ? payload.error : `Sodalis Home API returned HTTP ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  }
  return {
    getHomeEntities(query = "") {
      return request(`/api/home/entities?q=${encodeURIComponent(query)}`);
    },
    invokeHomeAction(id, arguments_) {
      return request("/api/home/actions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, arguments: arguments_ }),
      });
    },
    confirmHomeAction(confirmationId) {
      return request("/api/home/confirm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmationId }),
      });
    },
  };
}

export interface AppIntegrationAction extends Omit<AppActionDefinition, "execute"> {
  readonly scope?: "focused" | "global";
  readonly execute: (
    arguments_: Readonly<Record<string, unknown>>,
    context: { readonly api: SodalisAppApi },
  ) => string | Promise<string>;
}

export interface SodalisAppIntegration {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly actions: readonly AppIntegrationAction[];
}

export interface AppIntegrationRegistryOptions {
  readonly attention: Pick<{
    register(target: AttentionTargetRegistration): () => void;
  }, "register">;
  readonly getFocusedAppId: () => string | undefined;
  readonly getHost: () => DesktopHost | undefined;
  readonly api?: SodalisAppApi;
}

const APP_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function createAppIntegrationRegistry(options: AppIntegrationRegistryOptions) {
  const integrations = new Map<string, {
    readonly app: SodalisAppIntegration;
    readonly definitions: readonly (AppActionDefinition & { readonly scope?: "focused" | "global" })[];
  }>();
  const api = options.api ?? createSodalisAppApi();
  return {
    register(app: SodalisAppIntegration) {
      if (!APP_ID.test(app.id) || !app.name.trim()) {
        throw new TypeError("App integration ID or name is invalid.");
      }
      if (integrations.has(app.id)) throw new Error(`App "${app.id}" is already registered.`);
      let active = true;
      const definitions = app.actions.map((action) => {
        if (!action.id.startsWith(`${app.id}.`)) {
          throw new TypeError(`Action "${action.id}" must belong to "${app.id}".`);
        }
        if (action.scope && action.scope !== "focused" && action.scope !== "global") {
          throw new TypeError(`Action "${action.id}" has an invalid scope.`);
        }
        return {
          ...action,
          execute: (args: Readonly<Record<string, unknown>>) => {
            if (!active) throw new Error(`App "${app.id}" has been unregistered.`);
            return action.execute(args, { api });
          },
        };
      });
      if (new Set(definitions.map((action) => action.id)).size !== definitions.length) {
        throw new TypeError(`App "${app.id}" registers an action more than once.`);
      }
      createAssistantActionRuntime(definitions).getAvailableActions();
      integrations.set(app.id, { app, definitions });
      const targets = new Set<() => void>();
      return {
        registerTarget(target: Omit<AttentionTargetRegistration, "appId">) {
          if (!active) throw new Error(`App "${app.id}" has been unregistered.`);
          if (!target.id.startsWith(`${app.id}.`)) {
            throw new TypeError(`Attention target "${target.id}" must belong to "${app.id}".`);
          }
          const unregister = options.attention.register({ ...target, appId: app.id });
          targets.add(unregister);
          return () => {
            if (targets.delete(unregister)) unregister();
          };
        },
        dispose() {
          if (!active) return;
          active = false;
          for (const unregister of targets) unregister();
          targets.clear();
          integrations.delete(app.id);
        },
      };
    },
    getAvailableActions(): readonly AppActionDefinition[] {
      const focused = options.getFocusedAppId();
      return Array.from(integrations.values()).flatMap(({ app, definitions }) =>
        definitions.filter((action) => action.scope === "global" ||
          focused === app.id));
    },
    async getCurrentAppContext() {
      const focused = options.getFocusedAppId();
      const app = focused ? integrations.get(focused)?.app : undefined;
      if (app) {
        return {
          appId: app.id, appName: app.name,
          ...(app.category ? { category: app.category } : {}),
        };
      }
      return options.getHost()?.getCurrentAppContext();
    },
  };
}
