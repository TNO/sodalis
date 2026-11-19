import type { McpClient, StdioTransportOptions } from "@earendil-works/pi-mcp";
import { join } from "node:path";

export interface HomeSimulatorConnection {
  readonly root: string;
  readonly stateDir?: string;
  readonly role: "coordinator" | "avatar";
  readonly sessionId?: string;
  /** Alternate executable prefix for the fake stdio server in behavior tests. */
  readonly launch?: Pick<StdioTransportOptions, "command" | "args" | "env">;
}

export async function connectHomeSimulator(options: HomeSimulatorConnection): Promise<McpClient> {
  if (options.role === "avatar" && !options.sessionId) throw new Error("Avatar requires a replay session ID.");
  const python = process.platform === "win32"
    ? join(options.root, ".venv", "Scripts", "python.exe")
    : join(options.root, ".venv", "bin", "python");
  // Root tsx scripts use CommonJS; pi-mcp exposes only an ESM entry.
  const { McpClient, StdioTransport } = await import("@earendil-works/pi-mcp");
  const transport = new StdioTransport({
    command: options.launch?.command ?? python,
    args: [...(options.launch?.args ?? ["-m", "applications.tool_service"]),
      "--role", options.role, "--state-dir", options.stateDir ?? join(options.root, "output", "tool-service"),
      ...(options.role === "avatar" ? ["--session-id", options.sessionId!] : [])],
    cwd: options.root, env: options.launch?.env, stderr: "inherit",
  });
  const client = new McpClient({ name: "sodalis-home-simulator", version: "1", requestTimeoutMs: 30_000 });
  try {
    await client.connect(transport);
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export class HomeSimulatorToolError extends Error {}

export async function callHomeSimulator(
  client: McpClient, name: string, args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const result = await client.callTool(name, args);
  if (result.isError) {
    const message = result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    throw new HomeSimulatorToolError(message || `Home Simulator tool ${name} failed.`);
  }
  if (!result.structuredContent || typeof result.structuredContent !== "object" || Array.isArray(result.structuredContent)) {
    throw new Error(`Home Simulator tool ${name} returned no structured object.`);
  }
  return result.structuredContent as Record<string, unknown>;
}
