export interface HomeEntity {
  readonly entityId: string;
  readonly name: string;
  readonly domain: string;
  readonly state: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface HomeClient {
  listEntities(): Promise<readonly HomeEntity[]>;
  callService(
    domain: string,
    service: string,
    data: Readonly<Record<string, string | number>>,
  ): Promise<void>;
}

interface HomeAssistantClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetch?: typeof fetch;
}

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

export class HomeAssistantClient implements HomeClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;

  constructor(options: HomeAssistantClientOptions) {
    if (!options.token.trim()) throw new Error("Set HOME_ASSISTANT_TOKEN for the Home provider.");
    this.baseUrl = new URL("/api/", options.baseUrl).toString();
    this.token = options.token;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
    });
    if (!response.ok) throw new Error(`Home Assistant ${path} returned HTTP ${response.status}.`);
    return response.json();
  }

  async listEntities(): Promise<readonly HomeEntity[]> {
    const payload = await this.request("states");
    if (!Array.isArray(payload)) throw new Error("Home Assistant returned invalid states.");
    return payload.map((item: unknown) => {
      if (typeof item !== "object" || item === null ||
          !("entity_id" in item) || typeof item.entity_id !== "string" ||
          !ENTITY_ID.test(item.entity_id) ||
          !("state" in item) || typeof item.state !== "string" ||
          !("attributes" in item) || typeof item.attributes !== "object" ||
          item.attributes === null || Array.isArray(item.attributes)) {
        throw new Error("Home Assistant returned an invalid entity.");
      }
      const attributes = item.attributes as Record<string, unknown>;
      return {
        entityId: item.entity_id,
        name: typeof attributes.friendly_name === "string"
          ? attributes.friendly_name : item.entity_id,
        domain: item.entity_id.split(".")[0]!,
        state: item.state,
        attributes,
      };
    });
  }

  async callService(
    domain: string,
    service: string,
    data: Readonly<Record<string, string | number>>,
  ): Promise<void> {
    await this.request(`services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}
