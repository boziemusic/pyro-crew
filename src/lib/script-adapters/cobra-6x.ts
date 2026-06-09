import type { ScriptAdapter } from "./types";

export const cobra6xAdapter: ScriptAdapter = {
  key: "cobra_6x",
  label: "COBRA 6.X",
  parse: () => {
    throw new Error("COBRA 6.X script parsing is not implemented yet.");
  },
};
