import { describe, expect, it } from "vitest";
import { FAST_FORWARD_SPEED, TICK_RATE } from "../../src/sim/config";
import { createLocalSession } from "../../src/net/session";
import type { CommandResult } from "../../src/sim/types";

const TICK_MS = 1000 / TICK_RATE;

describe("LocalSession", () => {
  it("ticks by elapsed time between frames", () => {
    const session = createLocalSession(1);
    session.frame(1000);
    expect(session.state!.tick).toBe(0);
    session.frame(1000 + TICK_MS * 3);
    expect(session.state!.tick).toBe(3);
  });

  it("runs faster while fast-forwarding, and caps catch-up after a stall", () => {
    const session = createLocalSession(1);
    session.send({ type: "toggleFastForward" });
    session.frame(0);
    session.frame(TICK_MS * 2);
    expect(session.state!.tick).toBe(2 * FAST_FORWARD_SPEED);
    session.frame(60_000);
    expect(session.state!.tick).toBeLessThanOrEqual(
      2 * FAST_FORWARD_SPEED + 5 * FAST_FORWARD_SPEED,
    );
  });

  it("answers every command through onResult, straight away, as player 1", () => {
    const session = createLocalSession(1);
    const results: CommandResult[] = [];
    session.onResult = (r) => results.push(r);
    const { keep } = session.state!;
    session.send({ type: "sell", x: keep.x, y: keep.y });
    session.send({ type: "togglePause" });
    expect(results).toEqual([{ ok: false, reason: "Can't sell the keep" }, { ok: true }]);
    expect(session.state!.paused).toBe(true);
    expect(session.playerId).toBe(1);
    expect(session.online).toBe(false);
  });

  it("restart starts a new game on a new seed", () => {
    const session = createLocalSession(1, () => 42);
    session.restart();
    expect(session.state!.seed).toBe(42);
    expect(session.state!.tick).toBe(0);
  });
});
