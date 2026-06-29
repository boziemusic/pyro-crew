import type { ScriptAdapter, ScriptParseResult } from "./types";
import { parseCobraFirmwareCsv } from "./cobra-7x";

export function parseCobra8xCsv(contents: string): ScriptParseResult {
  return parseCobraFirmwareCsv(contents, {
    displayLabel: "COBRA 8.0",
    firmware: "8",
    ignoredEventFirstCells: ["end"],
  });
}

export const cobra8xAdapter: ScriptAdapter = {
  key: "cobra_8x",
  label: "COBRA 8.0",
  parse: parseCobra8xCsv,
};

