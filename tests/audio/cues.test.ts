import { describe, expect, it } from "vitest";
import { newCuePlayerState, selectCues, soundForResult } from "../../src/audio/cues";
import { noteToHz } from "../../src/audio/envelopes";
import { SOUNDS } from "../../src/audio/sounds";

const hit = (id: number) => ({ id, kind: "enemyHit" as const });
const keep = (id: number) => ({ id, kind: "keepHit" as const });

describe("selectCues", () => {
  it("plays each cue once, in id order", () => {
    let state = newCuePlayerState();
    const first = selectCues([keep(2), hit(1)], state, 0);
    expect(first.play).toEqual(["enemyHit", "keepHit"]);
    state = first.state;
    // The same cues again (e.g. a network snapshot replaced the state): nothing new.
    expect(selectCues([hit(1), keep(2)], state, 0.5).play).toEqual([]);
    expect(selectCues([hit(1), keep(2), keep(3)], state, 0.5).play).toEqual(["keepHit"]);
  });

  it("caps how many of one cue play within its window", () => {
    const { maxPerWindow, windowSeconds } = SOUNDS.enemyHit;
    const burst = Array.from({ length: maxPerWindow + 5 }, (_, i) => hit(i + 1));
    const result = selectCues(burst, newCuePlayerState(), 10);
    expect(result.play).toHaveLength(maxPerWindow);
    // Once the window has passed, hits play again.
    const later = selectCues([hit(100)], result.state, 10 + windowSeconds + 0.01);
    expect(later.play).toEqual(["enemyHit"]);
  });

  it("starts over when a new game restarts the ids", () => {
    const played = selectCues([keep(40), keep(41)], newCuePlayerState(), 0).state;
    expect(selectCues([keep(1)], played, 5).play).toEqual(["keepHit"]);
  });
});

describe("soundForResult", () => {
  it("plays build or sell when they succeed, and denied for any refusal", () => {
    expect(soundForResult("build", { ok: true })).toBe("build");
    expect(soundForResult("sell", { ok: true })).toBe("sell");
    expect(soundForResult("build", { ok: false, reason: "Not enough gold" })).toBe("denied");
    expect(soundForResult("sendWave", { ok: false, reason: "Wave still spawning" })).toBe("denied");
    expect(soundForResult("togglePause", { ok: true })).toBeNull();
  });
});

describe("the sound table", () => {
  it("has the designed keep-damage and treasure sounds", () => {
    const keepHit = SOUNDS.keepHit.notes[0];
    expect(keepHit.voice.wave).toBe("pulse");
    expect(keepHit.voice.pwm).toBeDefined();
    expect(keepHit.voice.pitchEnvelope?.semitones).toBe(16);
    expect(keepHit.hz).toBeCloseTo(noteToHz("G", 3), 6);

    const treasure = SOUNDS.treasure.notes[0];
    expect(treasure.voice.wave).toBe("pulse");
    expect(treasure.voice.pwm).toBeDefined();
    expect(treasure.voice.pitchEnvelope?.semitones).toBe(-14);
    expect(treasure.hz).toBeCloseTo(noteToHz("C", 4), 6);

    expect(SOUNDS.enemyHit.notes[0].voice.wave).toBe("noise");
  });

  it("gives every sound at least one note and a positive cap", () => {
    for (const sound of Object.values(SOUNDS)) {
      expect(sound.notes.length).toBeGreaterThan(0);
      expect(sound.maxPerWindow).toBeGreaterThan(0);
      expect(sound.windowSeconds).toBeGreaterThan(0);
    }
  });
});
