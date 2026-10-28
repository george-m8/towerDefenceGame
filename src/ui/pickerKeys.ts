// Building from the keyboard: 1, 2 or 3 opens a tab of the build picker, then 1-9 and 0 pick
// that tab's items in order, so 1 1 is a wall. Esc closes the picker. Pure: input.ts applies it.
import type { StructureKind } from "../sim/types";
import { tabForKey, type BuildTab } from "./state";

/** What a key does to the build picker; null leaves the key to the other shortcuts. */
export type PickerAction =
  | { type: "open"; tab: BuildTab }
  | { type: "pick"; tool: StructureKind }
  | { type: "close" }
  | { type: "none" }; // a number with no item: swallowed, nothing happens

/** The number key for each offered tool in a tab: "1"-"9", then "0"; none past the 10th. */
export function toolNumbers(tools: StructureKind[]): Map<StructureKind, string> {
  return new Map(tools.slice(0, 10).map((t, i) => [t, String((i + 1) % 10)]));
}

/** Digit1-Digit9 and Digit0 as the item's place in its tab (0-9), else null. */
function digitIndex(code: string): number | null {
  const match = /^Digit(\d)$/.exec(code);
  return match ? (Number(match[1]) + 9) % 10 : null;
}

export function pickerKey(
  picker: { open: boolean; tab: BuildTab },
  code: string,
  offered: (tab: BuildTab) => StructureKind[],
): PickerAction | null {
  if (code === "Escape") return picker.open ? { type: "close" } : null;
  if (!picker.open) {
    const tab = tabForKey(code);
    return tab && offered(tab).length > 0 ? { type: "open", tab } : null;
  }
  const index = digitIndex(code);
  if (index === null) return null;
  const tool = offered(picker.tab)[index];
  return tool ? { type: "pick", tool } : { type: "none" };
}
