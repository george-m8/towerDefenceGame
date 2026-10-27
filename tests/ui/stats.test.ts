import { describe, expect, it } from "vitest";
import { createGame } from "../../src/sim/game";
import { setClockHour } from "../../src/sim/clock";
import { GAME_CLOCK } from "../../src/sim/config";
import { statList } from "../../src/ui/stats";
import { endlessSummary } from "../../src/ui/gameOver";

const stat = (state: ReturnType<typeof createGame>, id: string) =>
  statList(state, 1).find((s) => s.id === id)!;

describe("the HUD's wave stats", () => {
  it("show the night and the wave with enemies at night", () => {
    const state = createGame(1, { blankMap: true, enemiesCome: "night" });
    state.wave.number = 7;
    state.clock!.day = 2;
    expect(stat(state, "wave")).toMatchObject({ label: "Night", value: "2 · wave 7" });
  });

  it("say the next wave comes at dusk by day", () => {
    const state = createGame(1, { blankMap: true, enemiesCome: "night" });
    setClockHour(state, GAME_CLOCK.sunrise + 2);
    expect(stat(state, "next").value).toBe("At dusk");
    setClockHour(state, 20);
    expect(stat(state, "next").value).toMatch(/^\d+s$/);
  });

  it("are as before with enemies all the time", () => {
    const state = createGame(1, { blankMap: true });
    state.wave.number = 7;
    expect(stat(state, "wave")).toMatchObject({ label: "Wave", value: "7" });
    expect(stat(state, "next").value).toMatch(/^\d+s$/);
  });
});

describe("endlessSummary", () => {
  it("counts the nights survived with enemies at night", () => {
    const state = createGame(1, { blankMap: true, enemiesCome: "night" });
    state.wave.number = 9;
    state.clock!.day = 4;
    expect(endlessSummary(state, "24m 10s")).toBe(
      `You survived 3 nights (reached wave 9) and held out for 24m 10s. Map seed ${state.seed}.`,
    );
    state.clock!.day = 2;
    expect(endlessSummary(state, "8m 0s")).toMatch(/^You survived 1 night \(/);
  });

  it("is as before with enemies all the time", () => {
    const state = createGame(1, { blankMap: true });
    state.wave.number = 9;
    expect(endlessSummary(state, "24m 10s")).toBe(
      `You reached wave 9 and held out for 24m 10s. Map seed ${state.seed}.`,
    );
  });
});
