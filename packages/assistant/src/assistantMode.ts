export type AssistantMode = "turn" | "workflow";

/** Discovers the selected server mode without exposing provider settings or credentials. */
export async function readAssistantMode(options: {
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly signal?: AbortSignal;
} = {}): Promise<AssistantMode> {
  const timeout = AbortSignal.timeout(5_000);
  const response = await (options.fetch ?? globalThis.fetch)(
    `${(options.baseUrl ?? "/api").replace(/\/+$/, "")}/assistant/config`,
    {
      cache: "no-store",
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    },
  );
  if (!response.ok) throw new Error(`Assistant configuration returned HTTP ${response.status}.`);
  const value: unknown = await response.json();
  if (
    typeof value !== "object" || value === null ||
    !("mode" in value) || (value.mode !== "turn" && value.mode !== "workflow")
  ) {
    throw new Error("Assistant server returned an invalid mode.");
  }
  return value.mode;
}
