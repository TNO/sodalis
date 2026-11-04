import { describe, expect, it, vi } from "vitest";
import { ServerWorkflowClient } from "./ServerWorkflowClient.js";

const request = {
  sessionId: "session-1",
  workflowId: "workflow-1",
  inputId: "input-1",
  messages: [{ role: "user" as const, content: "Hallo" }],
};

function sse(frames: object[], headers: Record<string, string> = {}) {
  return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream", "x-sodalis-workflow-id": "workflow-1", ...headers },
  });
}

async function collect(client: ServerWorkflowClient) {
  const events = [];
  for await (const event of client.start({ ...request, signal: new AbortController().signal })) events.push(event);
  return events;
}

describe("server workflow client", () => {
  it("posts the workflow and yields its lifecycle up to the terminal event", async () => {
    const fetch = vi.fn(async () =>
      sse([
        { type: "started", workflowId: "workflow-1", sequence: 0 },
        { type: "answer", workflowId: "workflow-1", sequence: 1, inputId: "input-1", text: "Hoi" },
      ]));
    const events = await collect(new ServerWorkflowClient({ baseUrl: "/api/", fetch }));
    expect(fetch).toHaveBeenCalledWith("/api/assistant/workflows", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual(request);
    expect(events.map((event) => event.type)).toEqual(["started", "answer"]);
  });

  it("rejects out-of-order, foreign and malformed events", async () => {
    const out = (frames: object[]) => collect(new ServerWorkflowClient({ fetch: async () => sse(frames) }));
    await expect(out([{ type: "answer", workflowId: "workflow-1", sequence: 1, inputId: "i", text: "x" }])).rejects.toThrow(/stale/);
    await expect(out([{ type: "started", workflowId: "other", sequence: 0 }])).rejects.toThrow(/stale/);
    await expect(out([{ type: "answer", workflowId: "workflow-1", sequence: 0, inputId: "i", text: "" }])).rejects.toThrow(/invalid/);
    await expect(collect(new ServerWorkflowClient({ fetch: async () => sse([], { "x-sodalis-workflow-id": "other" }) })))
      .rejects.toThrow(/mismatched/);
  });

  it("reports server errors and steering outcomes", async () => {
    const busy = new ServerWorkflowClient({ fetch: async () => Response.json({ error: "Assistant is at capacity." }, { status: 503 }) });
    await expect(collect(busy)).rejects.toThrow("Assistant is at capacity.");
    const steering = new ServerWorkflowClient({ fetch: async () => Response.json({ status: "not_running" }, { status: 409 }) });
    expect(await steering.steer({ workflowId: "workflow-1", inputId: "input-2", text: "En nu?" })).toBe("not_running");
    await expect(steering.cancel("workflow-1")).resolves.toBeUndefined();
  });
});
