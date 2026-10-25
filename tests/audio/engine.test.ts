import { describe, expect, it, vi } from "vitest";
import { createWebAudioEngine, unlockOnFirstGesture } from "../../src/audio/engine";
import type { VoiceSettings } from "../../src/audio/synth";

const BLIP: VoiceSettings = {
  wave: "pulse",
  volume: 0.3,
  envelope: { attack: 0, decay: 0.05, sustain: 0, release: 0.01 },
};

/** Just enough of an AudioContext for the engine's bus wiring. */
function fakeContext() {
  const node = () => ({
    gain: {
      value: 1,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn((n: unknown) => n),
  });
  return {
    currentTime: 3,
    destination: {},
    createGain: vi.fn(node),
    createDynamicsCompressor: vi.fn(node),
    resume: vi.fn(async () => {}),
  };
}

function setup() {
  const context = fakeContext();
  const createContext = vi.fn(() => context as unknown as AudioContext);
  const play = vi.fn();
  const engine = createWebAudioEngine({ createContext, playVoice: play });
  return { engine, context, createContext, play };
}

describe("web audio engine", () => {
  it("creates no audio context and plays nothing before unlock", () => {
    const { engine, createContext, play } = setup();
    engine.playNote(BLIP, 440, 0.1, "sfx");
    expect(createContext).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(engine.unlocked).toBe(false);
  });

  it("plays through the right bus after unlock, at the given time or now", () => {
    const { engine, play, context } = setup();
    engine.unlock();
    engine.playNote(BLIP, 440, 0.1, "sfx");
    engine.playNote(BLIP, 220, 0.5, "music", 10);
    expect(play).toHaveBeenCalledTimes(2);
    const [, sfxBus, , , sfxStart] = play.mock.calls[0];
    const [, musicBus, , , musicStart] = play.mock.calls[1];
    expect(sfxBus).not.toBe(musicBus);
    expect(sfxStart).toBe(context.currentTime);
    expect(musicStart).toBe(10);
  });

  it("unlocking twice creates only one context", () => {
    const { engine, createContext, context } = setup();
    engine.unlock();
    engine.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalled();
  });

  it("stays silent, without throwing, if audio can't start or a voice fails", () => {
    const failing = createWebAudioEngine({
      createContext: () => {
        throw new Error("no audio here");
      },
      playVoice: vi.fn(),
    });
    expect(() => failing.unlock()).not.toThrow();
    expect(failing.unlocked).toBe(false);
    expect(() => failing.playNote(BLIP, 440, 0.1, "sfx")).not.toThrow();

    const broken = createWebAudioEngine({
      createContext: () => fakeContext() as unknown as AudioContext,
      playVoice: () => {
        throw new Error("voice failed");
      },
    });
    broken.unlock();
    expect(broken.unlocked).toBe(true);
    expect(() => broken.playNote(BLIP, 440, 0.1, "sfx")).not.toThrow();
  });

  it("applies mute and volumes to the master and buses", () => {
    const { engine, context } = setup();
    engine.unlock();
    engine.setVolumes({ muted: false, music: 0.25, sfx: 0.5 });
    const gains = context.createGain.mock.results.map((r) => r.value.gain.value);
    expect(gains).toEqual(expect.arrayContaining([1, 0.25, 0.5]));
    engine.setVolumes({ muted: true, music: 0.25, sfx: 0.5 });
    const after = context.createGain.mock.results.map((r) => r.value.gain.value);
    expect(after).toContain(0);
  });

  it("remembers volumes set before unlock", () => {
    const { engine, context } = setup();
    engine.setVolumes({ muted: false, music: 0.1, sfx: 0.2 });
    engine.unlock();
    const gains = context.createGain.mock.results.map((r) => r.value.gain.value);
    expect(gains).toEqual(expect.arrayContaining([0.1, 0.2]));
  });
});

describe("unlockOnFirstGesture", () => {
  it("unlocks on the first click or key press, then stops listening", () => {
    const target = new EventTarget();
    const engine = { unlock: vi.fn() } as unknown as Parameters<typeof unlockOnFirstGesture>[0];
    unlockOnFirstGesture(engine, target as unknown as Window);
    expect(engine.unlock).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("keydown"));
    target.dispatchEvent(new Event("pointerdown"));
    expect(engine.unlock).toHaveBeenCalledTimes(1);
  });

  it("then tells the game, once (to start music asked for while locked)", () => {
    const target = new EventTarget();
    const engine = { unlock: vi.fn() } as unknown as Parameters<typeof unlockOnFirstGesture>[0];
    const unlocked = vi.fn();
    unlockOnFirstGesture(engine, target as unknown as Window, unlocked);
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("keydown"));
    expect(unlocked).toHaveBeenCalledTimes(1);
  });
});

describe("fadeOutMusic", () => {
  it("ramps the music bus to silence, then restores it; harmless before unlock", () => {
    const { engine, context } = setup();
    expect(() => engine.fadeOutMusic(1)).not.toThrow();
    engine.unlock();
    engine.setVolumes({ muted: false, music: 0.4, sfx: 0.8 });
    engine.fadeOutMusic(1);
    const music = context.createGain.mock.results
      .map((r) => r.value.gain)
      .find((g) => g.linearRampToValueAtTime.mock.calls.length > 0);
    expect(music.linearRampToValueAtTime).toHaveBeenCalledWith(0, context.currentTime + 1);
    expect(music.setValueAtTime).toHaveBeenLastCalledWith(0.4, expect.any(Number));
  });
});
