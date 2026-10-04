import { describe, expect, it, vi } from "vitest";
import { AmplitudeLipSyncAdapter } from "./AmplitudeLipSyncAdapter.js";

describe("AmplitudeLipSyncAdapter", () => {
  it("opens the mouth for voiced audio and returns to silence", () => {
    const setViseme = vi.fn();
    const adapter = new AmplitudeLipSyncAdapter({ setViseme });

    adapter.update(0.2);
    adapter.update(0.2);
    adapter.reset();

    expect(setViseme).toHaveBeenCalledWith("viseme_aa", expect.any(Number));
    expect(setViseme).toHaveBeenLastCalledWith("viseme_sil", 1);
  });

  it("does not flap the mouth for silence and rejects invalid levels", () => {
    const setViseme = vi.fn();
    const adapter = new AmplitudeLipSyncAdapter({ setViseme });

    adapter.update(0);
    adapter.update(0.005);

    expect(setViseme).not.toHaveBeenCalled();
    expect(() => adapter.update(Number.NaN)).toThrow(
      "Audio amplitude must be a finite non-negative number.",
    );
    expect(() => adapter.update(-0.1)).toThrow(
      "Audio amplitude must be a finite non-negative number.",
    );
  });
});
