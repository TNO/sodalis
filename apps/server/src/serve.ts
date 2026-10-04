import { serve } from "@hono/node-server";
import type { Hono } from "hono";

export function serveService(app: Hono, name: string, defaultPort: number): void {
  const port = Number(process.env.PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  serve(
    { fetch: app.fetch, hostname: process.env.HOST ?? "127.0.0.1", port },
    (info) => console.log(`Sodalis ${name} listening on ${info.address}:${info.port}`),
  );
}
