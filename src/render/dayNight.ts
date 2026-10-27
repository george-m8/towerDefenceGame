// The day and night cycle: where the sun is, and how light it is, for a time on a 24-hour clock.
// The sun rises on a shallow arc, is about overhead at noon and leans well back by sunset; after
// sunset the light fades into night, and comes back before sunrise.
import { DAY_NIGHT } from "./palette";
import type { Sun } from "./sun";

/** A number held between two others. */
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Where the sun is at an hour of the day. Before sunrise and after sunset it's at the horizon. */
export function sunAt(hour: number): Sun {
  const { sunrise, noon, sunset, arcAtSunrise, arcAtNoon, arcAtSunset } = DAY_NIGHT;
  const time = clamp(hour, sunrise, sunset);
  const arc =
    time <= noon
      ? arcAtSunrise + ((time - sunrise) / (noon - sunrise)) * (arcAtNoon - arcAtSunrise)
      : arcAtNoon + ((time - noon) / (sunset - noon)) * (arcAtSunset - arcAtNoon);
  return { across: (time - sunrise) / (sunset - sunrise), arc };
}

/** How light it is, from 1 (day) to 0 (night): it fades over the twilight after sunset and before sunrise. */
export function daylight(hour: number): number {
  const { sunrise, sunset, twilight } = DAY_NIGHT;
  const morning = (hour - (sunrise - twilight)) / twilight;
  const evening = (sunset + twilight - hour) / twilight;
  return clamp(Math.min(morning, evening), 0, 1);
}

/** How strongly night washes over the map. */
export function darknessAt(hour: number): number {
  return DAY_NIGHT.darkness * (1 - daylight(hour));
}

/** An hour brought back round into 0 to 24. */
export function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/** The Time slider's label, on a 24-hour clock. */
export function clockLabel(hour: number): string {
  const minutes = Math.floor(hour * 60 + 1e-9);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Time ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
