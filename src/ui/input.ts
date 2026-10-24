import type { Command, CommandResult } from "../sim/types";

export function bindInput(dispatch: (command: Command) => CommandResult) {
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      dispatch({ type: "togglePause" });
    }
  });
}
