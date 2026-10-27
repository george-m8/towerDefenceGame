import { describe, expect, it } from "vitest";
import { ENEMY_KINDS, STRUCTURES, UNIT_KINDS, type StructureStats } from "../../src/sim/config";
import type { StructureKind } from "../../src/sim/types";
import { buildHints, canRotate, describeKind, traits } from "../../src/ui/describe";

const KINDS = Object.keys(STRUCTURES) as StructureKind[];

describe("describeKind", () => {
  it("gives an archer's damage, interval, range and fixed arc", () => {
    const tower = STRUCTURES.archer.tower;
    const { title, description, numbers } = describeKind({ type: "structure", kind: "archer" });
    expect(title).toBe(STRUCTURES.archer.name);
    expect(description).toBe(STRUCTURES.archer.description);
    expect(numbers).toContain(
      `${tower.damage} dmg every ${tower.fireIntervalSeconds}s · range ${tower.range}`,
    );
    expect(numbers).toContain(`${tower.arcDegrees}° arc, fixed`);
  });

  it("gives a cannon's splash and turning", () => {
    const tower = STRUCTURES.cannon.tower;
    const text = describeKind({ type: "structure", kind: "cannon" }).numbers.join("\n");
    expect(text).toContain(`splash ${tower.splashRadius}`);
    expect(text).toContain(`turns ${tower.turnDegreesPerSecond}°/s`);
  });

  it("gives a guardhouse's unit, quota and interval, with the unit's numbers", () => {
    const { unit, quota, intervalSeconds } = STRUCTURES.guardhouse.spawner;
    const kind = UNIT_KINDS[unit];
    const text = describeKind({ type: "structure", kind: "guardhouse" }).numbers.join("\n");
    expect(text).toContain(`every ${intervalSeconds}s, up to ${quota} at once`);
    expect(text).toContain(`${kind.name}: HP ${kind.hp}`);
    expect(text).toContain(`${kind.damage} dmg every ${kind.attackInterval}s, reach ${kind.range}`);
  });

  it("gives an enemy's HP, damage and speed", () => {
    const kind = ENEMY_KINDS.goblin;
    const { description, numbers } = describeKind({ type: "enemy", kind: "goblin" });
    expect(description).toBe(kind.description);
    expect(numbers).toContain(`HP ${kind.hp}`);
    expect(numbers).toContain(`${kind.damage} dmg every ${kind.attackInterval}s`);
    expect(numbers).toContain(`Speed ${kind.speed}`);
  });

  it("gives a unit's armour", () => {
    const kind = UNIT_KINDS.paladin;
    const { numbers } = describeKind({ type: "unit", kind: "paladin" });
    expect(numbers).toContain(`HP ${kind.hp}, armour ${kind.armour}`);
  });
});

describe("traits", () => {
  it("names a catapult's splash, minimum range and holding fire", () => {
    expect(traits("catapult")).toEqual(
      expect.arrayContaining([
        "Splash damage",
        `Can't hit enemies closer than ${STRUCTURES.catapult.tower.minRange} tiles`,
        "Won't fire where its blast would hit your own walls",
        "Turns slowly",
      ]),
    );
  });

  it("names the rest from their stats", () => {
    expect(traits("archer")).toContain("Fixed: fires through a slit");
    expect(traits("floorSpikes")).toContain("Enemies walk over it");
    expect(traits("wall")).toContain("Blocks enemies");
    expect(traits("house")).toContain("Makes gold over time");
    expect(traits("gate")).toContain("Enemies walk through it");
    expect(traits("watchtower")).toContain("Never fires");
    expect(traits("guardhouse")).toEqual([]);
  });
});

describe("canRotate and buildHints", () => {
  it("rotates exactly the directional kinds and fixed-arc towers", () => {
    for (const kind of KINDS) {
      const stats: StructureStats = STRUCTURES[kind];
      const turnable = stats.directional === true || stats.tower?.turnDegreesPerSecond === 0;
      expect(canRotate(kind)).toBe(turnable);
      expect(buildHints(kind).includes("R to rotate")).toBe(turnable);
    }
    expect(canRotate("archer")).toBe(true);
    expect(canRotate("cannon")).toBe(false);
  });

  it("mentions the enclosure discount for every kind, and bridges' river rule", () => {
    for (const kind of KINDS) {
      expect(buildHints(kind).join("\n")).toContain("off inside your keep's walls");
    }
    expect(buildHints("bridge")).toContain("Only on a river");
  });
});

describe("descriptions", () => {
  it("every structure and unit kind has one, with no numbers in it", () => {
    for (const stats of [...Object.values(STRUCTURES), ...Object.values(UNIT_KINDS)]) {
      expect(stats.description.length).toBeGreaterThan(0);
      expect(stats.description).not.toMatch(/\d/);
    }
  });
});
