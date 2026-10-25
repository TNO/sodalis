import { describe, expect, it, vi } from "vitest";
import { createPocketTtsHostService } from "./PocketTtsHostService.js";

describe("Pocket TTS host service", () => {
  it("registers the reference, warms the runtime, and exposes its voice API", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/audio/voices")) {
        if (init?.method === "POST") {
          expect(JSON.parse(String(init.body))).toEqual({
            name: "piper-female-nl-reference",
            wav_b64: "AQID",
          });
          return Response.json({ status: "registered" });
        }
        return Response.json({
          voices: [{ name: "piper-female-nl-reference", kind: "registered" }],
        });
      }
      if (url.endsWith("/v1/audio/speech")) {
        return new Response(new Uint8Array([1, 0, 2, 0]));
      }
      throw new Error(`Unexpected runtime URL ${url}`);
    });
    const app = await createPocketTtsHostService({
      nativeServerUrl: "http://127.0.0.1:8093",
      apiKey: "host-secret",
      voice: "piper-female-nl-reference",
      referenceWav: new Uint8Array([1, 2, 3]),
      fetch: fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      input: "Een korte test.",
      voice: "piper-female-nl-reference",
      response_format: "pcm",
      seed: 42,
    });

    const unauthorized = await app.request("/v1/voices");
    expect(unauthorized.status).toBe(401);
    const voices = await app.request("/v1/voices", {
      headers: { authorization: "Bearer host-secret" },
    });
    expect(await voices.json()).toEqual({
      voices: [{ name: "piper-female-nl-reference", kind: "registered" }],
    });
    const capabilities = await app.request("/v1/capabilities", {
      headers: { authorization: "Bearer host-secret" },
    });
    expect(await capabilities.json()).toMatchObject({
      provider: "pockettts.cpp",
      sampleRate: 24000,
      languages: ["nl-NL"],
      streamingAudio: false,
    });
  });

  it("only proxies authorized synthesis for the configured voice", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(new Uint8Array([1, 0, 2, 0])),
    );
    const app = await createPocketTtsHostService({
      nativeServerUrl: "http://127.0.0.1:8093",
      apiKey: "host-secret",
      voice: "piper-female-nl-reference",
      referenceWav: new Uint8Array([1]),
      fetch: fetcher,
    });
    const headers = {
      authorization: "Bearer host-secret",
      "content-type": "application/json",
    };
    const invalidVoice = await app.request("/v1/audio/speech", {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: "Hallo.",
        voice: "unregistered",
        response_format: "pcm",
      }),
    });
    expect(invalidVoice.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(2);

    const response = await app.request("/v1/audio/speech", {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: "Hallo.",
        voice: "piper-female-nl-reference",
        response_format: "pcm",
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "audio/pcm;rate=24000;bits=16;channels=1;endianness=little",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 0, 2, 0]),
    );
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8093/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          input: "Hallo.",
          voice: "piper-female-nl-reference",
          response_format: "pcm",
          seed: 42,
        }),
      }),
    );
  });
});
