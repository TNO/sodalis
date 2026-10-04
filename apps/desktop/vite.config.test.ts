import { afterEach, describe, expect, it, vi } from "vitest";

describe("Vite API proxies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("targets native services without a gateway override", async () => {
    vi.stubEnv("SODALIS_API_GATEWAY_URL", undefined);
    vi.stubEnv("SODALIS_SPEECH_API_URL", undefined);
    vi.stubEnv("SODALIS_AI_API_URL", undefined);
    vi.stubEnv("SODALIS_HOME_API_URL", undefined);
    vi.resetModules();
    const { default: config } = await import("./vite.config.js");
    expect(config.server?.proxy).toMatchObject({
      "/api/speech": { target: "http://127.0.0.1:3001" },
      "/api/assistant": { target: "http://127.0.0.1:3002" },
      "/api/home": { target: "http://127.0.0.1:3003" },
    });
  });

  it("uses the Compose gateway except for an explicitly overridden service", async () => {
    vi.stubEnv("SODALIS_API_GATEWAY_URL", "http://127.0.0.1:4176");
    vi.stubEnv("SODALIS_SPEECH_API_URL", "http://127.0.0.1:3001");
    vi.stubEnv("SODALIS_AI_API_URL", undefined);
    vi.stubEnv("SODALIS_HOME_API_URL", undefined);
    vi.resetModules();
    const { default: config } = await import("./vite.config.js");
    expect(config.server?.proxy).toMatchObject({
      "/api/speech": { target: "http://127.0.0.1:3001" },
      "/api/assistant": { target: "http://127.0.0.1:4176" },
      "/api/home": { target: "http://127.0.0.1:4176" },
    });
  });
});
