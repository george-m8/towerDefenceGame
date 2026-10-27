import { describe, expect, it } from "vitest";
import { createUiState } from "../../src/ui/state";
import { advanceClock, followSky, setHour, toggleClock } from "../../src/ui/clockControls";
import { sunAt } from "../../src/render/dayNight";
import { DEFAULT_SUN } from "../../src/render/sun";
import { DAY_NIGHT } from "../../src/render/palette";

describe("toggleClock", () => {
  it("turns the clock on at the start hour, stopped, with the sun there", () => {
    const ui = createUiState();
    toggleClock(ui);
    expect(ui.clock).toEqual({ hour: DAY_NIGHT.startHour, playing: false });
    expect(ui.sun).toEqual(sunAt(DAY_NIGHT.startHour));
  });

  it("turns it off, putting the sun back", () => {
    const ui = createUiState();
    toggleClock(ui);
    setHour(ui, 17);
    toggleClock(ui);
    expect(ui.clock).toBeNull();
    expect(ui.sun).toEqual(DEFAULT_SUN);
  });
});

describe("setHour", () => {
  it("moves the clock and the sun, wrapping past midnight", () => {
    const ui = createUiState();
    toggleClock(ui);
    setHour(ui, 16);
    expect(ui.clock!.hour).toBe(16);
    expect(ui.sun).toEqual(sunAt(16));
    setHour(ui, 25);
    expect(ui.clock!.hour).toBe(1);
  });

  it("does nothing with the clock off", () => {
    const ui = createUiState();
    setHour(ui, 16);
    expect(ui.clock).toBeNull();
    expect(ui.sun).toEqual(DEFAULT_SUN);
  });
});

describe("advanceClock", () => {
  it("runs a whole day in the cycle's length, only while playing", () => {
    const ui = createUiState();
    toggleClock(ui);
    advanceClock(ui, DAY_NIGHT.secondsPerDay / 24);
    expect(ui.clock!.hour).toBe(DAY_NIGHT.startHour);
    ui.clock!.playing = true;
    advanceClock(ui, DAY_NIGHT.secondsPerDay / 24);
    expect(ui.clock!.hour).toBeCloseTo(DAY_NIGHT.startHour + 1);
    expect(ui.sun).toEqual(sunAt(ui.clock!.hour));
    advanceClock(ui, DAY_NIGHT.secondsPerDay);
    expect(ui.clock!.hour).toBeCloseTo(DAY_NIGHT.startHour + 1);
  });
});

describe("followSky", () => {
  it("sets the sun from the game's clock whenever its hour moves", () => {
    const ui = createUiState();
    const last = followSky(ui, { hour: 20, day: 1 }, null);
    expect(last).toBe(20);
    expect(ui.sun).toEqual(sunAt(20));
  });

  it("leaves a previewed sun alone while the game's hour stands still, and pulls it back when it moves", () => {
    const ui = createUiState();
    followSky(ui, { hour: 20, day: 1 }, null);
    ui.sun = { across: 0.1, arc: 30 };
    followSky(ui, { hour: 20, day: 1 }, 20);
    expect(ui.sun).toEqual({ across: 0.1, arc: 30 });
    followSky(ui, { hour: 20.01, day: 1 }, 20);
    expect(ui.sun).toEqual(sunAt(20.01));
  });

  it("goes back to the Debug clock's sun, or the default, when the game's clock goes", () => {
    const ui = createUiState();
    followSky(ui, { hour: 20, day: 1 }, null);
    expect(followSky(ui, null, 20)).toBeNull();
    expect(ui.sun).toEqual(DEFAULT_SUN);
    toggleClock(ui);
    followSky(ui, { hour: 20, day: 1 }, null);
    followSky(ui, null, 20);
    expect(ui.sun).toEqual(sunAt(DAY_NIGHT.startHour));
  });
});
