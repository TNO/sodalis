import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const SIMULATION_TIME = "2025-02-15T09:30:00+00:00";

export async function fakeHomeSimulator() {
  const requests: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const replies = new Map<string, { status?: number; body: unknown; raw?: boolean; hang?: boolean; headers?: Record<string, string> }>([
    ["/clock", { body: { simulationTime: SIMULATION_TIME } }],
    ["/tools/query_sensor_data", { body: {
      events: [{ sequence: 1088, timestamp: "2025-02-15T09:00:00+01:00", property: "DoorOpen", value: true }],
      has_more: false, next_after_sequence: 1088, through: SIMULATION_TIME, clock: "received_at",
    } }],
  ]);
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    requests.push({ method: request.method!, path: request.url!, body: body ? JSON.parse(body) : {} });
    const reply = replies.get(request.url!);
    if (reply?.hang) return;
    response.writeHead(reply?.status ?? (reply ? 200 : 404), { "content-type": "application/json", ...reply?.headers });
    response.end(reply?.raw ? String(reply.body) : JSON.stringify(reply ? reply.body : { error: "not found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    replies,
    async close() {
      if (!server.listening) return;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
