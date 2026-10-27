import { describe, expect, it } from "vitest";
import {
  clockLabel,
  darknessAt,
  daylight,
  skyHour,
  sunAt,
  wrapHour,
} from "../../src/render/dayNight";
import { DAY_NIGHT } from "../../src/render/palette";
import { GAME_CLOCK } from "../../src/sim/config";

const { sunrise, sunset } = GAME_CLOCK;
const noon = (sunrise + sunset) / 2;
/** Round the clock in quarter hours. */
const day = Array.from({ length: 97 }, (_, i) => i / 4);

describe("sunAt", () => {
  it("rises shallow, is about overhead at noon, and leans well back at sunset", () => {
    expect(sunAt(sunrise)).toEqual({ across: 0, arc: DAY_NIGHT.arcAtSunrise });
    expect(sunAt(noon)).toEqual({ across: 0.5, arc: DAY_NIGHT.arcAtNoon });
    expect(sunAt(sunset)).toEqual({ across: 1, arc: DAY_NIGHT.arcAtSunset });
    expect(DAY_NIGHT.arcAtSunrise).toBeLessThan(90);
    expect(DAY_NIGHT.arcAtSunset).toBeGreaterThan(90);
  });

  it("moves in step with the clock between them", () => {
    const morning = sunAt((sunrise + noon) / 2);
    expect(morning.across).toBeCloseTo(0.25);
    expect(morning.arc).toBeCloseTo((DAY_NIGHT.arcAtSunrise + DAY_NIGHT.arcAtNoon) / 2);
    const evening = sunAt((noon + sunset) / 2);
    expect(evening.across).toBeCloseTo(0.75);
    expect(evening.arc).toBeCloseTo((DAY_NIGHT.arcAtNoon + DAY_NIGHT.arcAtSunset) / 2);
  });

  it("stays at the horizon before sunrise and after sunset", () => {
    expect(sunAt(2)).toEqual(sunAt(sunrise));
    expect(sunAt(22)).toEqual(sunAt(sunset));
  });
});

describe("daylight", () => {
  it("is full by day and none at night", () => {
    expect(daylight(noon)).toBe(1);
    expect(daylight(sunset)).toBe(1);
    expect(daylight(sunrise)).toBe(1);
    expect(daylight(0)).toBe(0);
    expect(daylight(sunset + DAY_NIGHT.twilight)).toBe(0);
    expect(daylight(sunrise - DAY_NIGHT.twilight)).toBe(0);
  });

  it("fades over the twilight after sunset, and comes back over the twilight before sunrise", () => {
    expect(daylight(sunset + DAY_NIGHT.twilight / 2)).toBeCloseTo(0.5);
    expect(daylight(sunrise - DAY_NIGHT.twilight / 2)).toBeCloseTo(0.5);
  });
});

describe("darknessAt", () => {
  it("is darkest at night, never above the night's darkness, and none by day", () => {
    expect(darknessAt(0)).toBeCloseTo(DAY_NIGHT.darkness);
    expect(darknessAt(noon)).toBe(0);
    for (const hour of day) {
      expect(darknessAt(hour)).toBeGreaterThanOrEqual(0);
      expect(darknessAt(hour)).toBeLessThanOrEqual(DAY_NIGHT.darkness);
    }
  });
});

describe("wrapHour", () => {
  it("wraps round past midnight, both ways", () => {
    expect(wrapHour(25)).toBe(1);
    expect(wrapHour(24)).toBe(0);
    expect(wrapHour(-1)).toBe(23);
    expect(wrapHour(13.5)).toBe(13.5);
  });
});

describe("clockLabel", () => {
  it("shows the time on a 24-hour clock", () => {
    expect(clockLabel(14.5)).toBe("Time 14:30");
    expect(clockLabel(9)).toBe("Time 09:00");
    expect(clockLabel(23.99)).toBe("Time 23:59");
  });
});

describe("skyHour", () => {
  it("draws the sky from the game's clock first, else the Debug clock, else none", () => {
    expect(skyHour({ hour: 20, day: 1 }, { hour: 9, playing: false })).toBe(20);
    expect(skyHour(null, { hour: 9, playing: false })).toBe(9);
    expect(skyHour(null, null)).toBeUndefined();
  });
});
