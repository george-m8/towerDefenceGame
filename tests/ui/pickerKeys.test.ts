import { describe, expect, it } from "vitest";
import type { StructureKind } from "../../src/sim/types";
import { pickerKey, toolNumbers } from "../../src/ui/pickerKeys";
import type { BuildTab } from "../../src/ui/state";

const TABS: Record<BuildTab, StructureKind[]> = {
  towers: ["wall", "gate", "archer"],
  units: ["guardhouse", "barracks"],
  civic: [],
};
const offered = (tab: BuildTab) => TABS[tab];

describe("toolNumbers", () => {
  it("numbers 1-9 then 0, with nothing past the tenth", () => {
    const tools = [
      "wall",
      "gate",
      "bridge",
      "watchtower",
      "archer",
      "cannon",
      "catapult",
      "floorSpikes",
      "wallSpikes",
      "house",
      "shop",
      "mine",
    ] as StructureKind[];
    const numbers = toolNumbers(tools);
    expect(tools.map((t) => numbers.get(t))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      undefined,
      undefined,
    ]);
  });
});

describe("pickerKey", () => {
  const closed = { open: false, tab: "towers" as BuildTab };
  const open = (tab: BuildTab) => ({ open: true, tab });

  it("opens a tab on 1, 2 or 3 while closed, if it has anything", () => {
    expect(pickerKey(closed, "Digit1", offered)).toEqual({ type: "open", tab: "towers" });
    expect(pickerKey(closed, "Digit2", offered)).toEqual({ type: "open", tab: "units" });
    expect(pickerKey(closed, "Digit3", offered)).toBeNull(); // Civic has nothing here
    expect(pickerKey(closed, "Digit4", offered)).toBeNull();
    expect(pickerKey(closed, "Digit0", offered)).toBeNull();
  });

  it("picks the numbered item in the open tab", () => {
    expect(pickerKey(open("towers"), "Digit1", offered)).toEqual({ type: "pick", tool: "wall" });
    expect(pickerKey(open("towers"), "Digit3", offered)).toEqual({
      type: "pick",
      tool: "archer",
    });
    expect(pickerKey(open("units"), "Digit1", offered)).toEqual({
      type: "pick",
      tool: "guardhouse",
    });
  });

  it("does nothing for a number with no item, and never switches tabs while open", () => {
    expect(pickerKey(open("units"), "Digit3", offered)).toEqual({ type: "none" });
    expect(pickerKey(open("towers"), "Digit0", offered)).toEqual({ type: "none" });
  });

  it("closes the picker on Escape, and leaves Escape alone when it's closed", () => {
    expect(pickerKey(open("towers"), "Escape", offered)).toEqual({ type: "close" });
    expect(pickerKey(closed, "Escape", offered)).toBeNull();
  });

  it("ignores other keys", () => {
    expect(pickerKey(open("towers"), "KeyR", offered)).toBeNull();
    expect(pickerKey(closed, "KeyX", offered)).toBeNull();
  });
});
