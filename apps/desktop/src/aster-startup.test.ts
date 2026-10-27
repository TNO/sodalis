// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import coreSource from "../public/aster/src/core.js?raw";

interface AsterStartupApi {
  startupErrorMessage(error: unknown): string;
  db: { init(): Promise<void>; mode: string; problem?: string };
}

type Handler = ((event: { target: unknown }) => void) | null;
interface FakeRequest {
  result?: unknown;
  error?: DOMException;
  onsuccess?: Handler;
  onerror?: Handler;
}

/** IndexedDB as in WebKit web views that refuse to store Blobs. */
function blobRefusingIndexedDb() {
  const db = {
    objectStoreNames: { contains: () => true },
    close: vi.fn(),
    transaction() {
      const tx: { error?: DOMException; onerror?: Handler; onabort?: Handler; objectStore(): unknown } = {
        objectStore: () => ({
          put(value: unknown): FakeRequest {
            const request: FakeRequest = {};
            setTimeout(() => {
              if (!(value instanceof window.Blob)) return;
              request.error = new DOMException(
                "Error preparing Blob/File data to be stored in object store",
                "UnknownError",
              );
              request.onerror?.({ target: request });
              tx.onerror?.({ target: request });
              tx.error = request.error;
              tx.onabort?.({ target: tx });
            });
            return request;
          },
          delete: (): FakeRequest => ({}),
        }),
      };
      return tx;
    },
  };
  return {
    open(): FakeRequest {
      const request: FakeRequest = { result: db };
      setTimeout(() => request.onsuccess?.({ target: request }));
      return request;
    },
  };
}

describe("Aster startup failure reporting", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "Aster");
    Reflect.deleteProperty(window, "indexedDB");
  });

  it("describes a null startup rejection without throwing another TypeError", async () => {
    window.eval(coreSource);

    const aster = (window as Window & { Aster?: AsterStartupApi }).Aster;
    expect(aster?.startupErrorMessage(null)).toBe(
      "Aster startup failed without an error object.",
    );
  });

  it("falls back to a memory-only session when IndexedDB refuses Blobs", async () => {
    Object.defineProperty(window, "indexedDB", { value: blobRefusingIndexedDb(), configurable: true });
    window.eval(coreSource);

    const aster = (window as Window & { Aster?: AsterStartupApi }).Aster;
    await aster?.db.init();
    expect(aster?.db.mode).toBe("Memory only");
    expect(aster?.db.problem).toContain("Error preparing Blob/File data");
  });
});
