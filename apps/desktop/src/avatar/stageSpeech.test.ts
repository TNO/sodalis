import { describe, expect, it, vi } from "vitest";
import { pickOnDeviceVoice, playRecordedOnStage, speakOnStage } from "./stageSpeech.js";

const voice = (name: string, lang: string, localService: boolean) =>
  ({ name, lang, localService, default: false }) as SpeechSynthesisVoice;

describe("stage speech", () => {
  it("only picks on-device English voices, so no text leaves the machine", () => {
    const cloud = voice("Google UK English Female", "en-GB", false);
    const dutch = voice("Xander", "nl-NL", true);
    const samantha = voice("Samantha", "en-US", true);

    expect(pickOnDeviceVoice([cloud, dutch, samantha])).toBe(samantha);
    expect(pickOnDeviceVoice([cloud, dutch])).toBeUndefined();
  });

  it("starts lip sync when the voice starts, scaled to the speaking rate", () => {
    const startMockSpeech = vi.fn();
    let utterance: SpeechSynthesisUtterance | undefined;
    const synth = {
      cancel: vi.fn(),
      speak: vi.fn((next: SpeechSynthesisUtterance) => {
        utterance = next;
      }),
    };
    const samantha = voice("Samantha", "en-US", true);

    speakOnStage({
      text: "Hello there.",
      rate: 2,
      voice: samantha,
      controller: { startMockSpeech },
      synth,
      createUtterance: (text) =>
        ({ text, rate: 1, voice: null }) as unknown as SpeechSynthesisUtterance,
    });

    expect(synth.cancel).toHaveBeenCalled();
    expect(utterance).toMatchObject({ text: "Hello there.", rate: 2, voice: samantha });
    expect(startMockSpeech).not.toHaveBeenCalled();
    utterance?.onstart?.(new Event("start") as SpeechSynthesisEvent);
    const sequence = startMockSpeech.mock.calls[0]?.[0];
    const normal = vi.fn();
    speakOnStage({ text: "Hello there.", rate: 1, controller: { startMockSpeech: normal } });
    expect(sequence.durationSeconds).toBeCloseTo(
      normal.mock.calls[0]?.[0].durationSeconds / 2,
      5,
    );
  });

  it("plays lip sync silently when no on-device voice is chosen", () => {
    const startMockSpeech = vi.fn();
    speakOnStage({ text: "Hello.", rate: 1, controller: { startMockSpeech } });
    expect(startMockSpeech).toHaveBeenCalledOnce();
  });

  it("starts a recorded clip's Azure viseme track when its audio starts playing", async () => {
    const startMockSpeech = vi.fn();
    let onPlaying: (() => void) | undefined;
    const audio = {
      play: vi.fn(async () => undefined),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === "playing") onPlaying = listener;
      }),
    };

    await playRecordedOnStage({
      clip: { text: "Hallo", durationMs: 600, visemes: [{ id: 12, offsetMs: 100 }, { id: 2, offsetMs: 200 }] },
      audio: audio as unknown as Pick<HTMLAudioElement, "play" | "addEventListener">,
      controller: { startMockSpeech },
    });

    expect(audio.play).toHaveBeenCalledOnce();
    expect(startMockSpeech).not.toHaveBeenCalled();
    onPlaying?.();
    expect(startMockSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 0.6 }),
    );
  });
});
