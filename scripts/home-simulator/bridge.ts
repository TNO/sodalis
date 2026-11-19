import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { callHomeSimulator, connectHomeSimulator, HomeSimulatorToolError, type HomeSimulatorConnection } from "./client.js";
import type { SessionHandoff } from "./session.js";

const READ_TOOLS = new Set(["query_sensor_data", "get_context", "query_ontology", "query_weather", "get_agenda"]);

export interface BridgeOptions {
  readonly handoff: SessionHandoff;
  readonly host?: string;
  readonly port: number;
  readonly launch?: HomeSimulatorConnection["launch"];
  readonly warn?: (message: string) => void;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export function resolveBridgeHost(
  configured = "",
  network: { platform: NodeJS.Platform; addresses: readonly string[] } = {
    platform: process.platform,
    addresses: Object.values(networkInterfaces()).flatMap((entries) => entries?.map((entry) => entry.address) ?? []),
  },
): string {
  const host = configured.trim() || (network.platform === "linux" && network.addresses.includes("172.17.0.1")
    ? "172.17.0.1" : "127.0.0.1");
  const octets = host.split(".").map(Number);
  const privateV4 = isIP(host) === 4 && (octets[0] === 127 || octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
  const privateV6 = isIP(host) === 6 && (host === "::1" || /^(fc|fd)[0-9a-f]{2}:/i.test(host));
  if (!privateV4 && !privateV6) {
    throw new Error("HOME_SIMULATOR_BRIDGE_HOST must be a specific private or loopback IP address, never a wildcard or public address.");
  }
  return host;
}

export async function startHomeSimulatorBridge(options: BridgeOptions): Promise<{
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const host = resolveBridgeHost(options.host);
  const client = await connectHomeSimulator({ ...options.handoff, role: "avatar", launch: options.launch });
  let closing = false;
  client.onClose(() => {
    if (!closing) (options.warn ?? console.warn)("Home Simulator avatar child exited; bridge unavailable.");
  });
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (client.connectionState !== "connected") {
      json(response, 503, { error: "unavailable" });
      return;
    }
    const path = request.url ?? "";
    const tool = path.startsWith("/tools/") ? path.slice(7) : "";
    if (path !== "/health" && path !== "/clock" && !READ_TOOLS.has(tool)) {
      json(response, 404, { error: "not found" });
      return;
    }
    if (request.method !== (tool ? "POST" : "GET")) {
      json(response, 405, { error: "method not allowed" });
      return;
    }
    if (path === "/health") json(response, 200, { ok: true });
    else if (path === "/clock") {
      const session = await callHomeSimulator(client, "get_session");
      json(response, 200, { simulationTime: session.simulation_time });
    } else {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 1_048_576) {
          json(response, 413, { error: "Argument body too large." });
          request.resume();
          return;
        }
        chunks.push(buffer);
      }
      let args: unknown;
      try { args = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* Invalid JSON is rejected below. */ }
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        json(response, 400, { error: "Expected a JSON object." });
        return;
      }
      json(response, 200, await callHomeSimulator(client, tool, args as Record<string, unknown>));
    }
  }
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      json(response, error instanceof HomeSimulatorToolError ? 422 : 503,
        { error: error instanceof HomeSimulatorToolError ? error.message : "unavailable" });
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, host, () => { server.off("error", reject); resolve(); });
    });
  } catch (error) {
    await client.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Home Simulator bridge did not bind TCP.");
  return {
    url: `http://${host.includes(":") ? `[${host}]` : host}:${address.port}`,
    close: async () => {
      if (closing) return;
      closing = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error) reject(error); else resolve(); });
        server.closeAllConnections();
      });
      await client.close();
    },
  };
}
