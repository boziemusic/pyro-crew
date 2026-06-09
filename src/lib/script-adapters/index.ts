import { cobra6xAdapter } from "./cobra-6x";
import type { ScriptAdapter, ScriptAdapterKey } from "./types";

export const SCRIPT_ADAPTERS: Record<ScriptAdapterKey, ScriptAdapter> = {
  cobra_6x: cobra6xAdapter,
};

export type { ScriptAdapter, ScriptAdapterKey } from "./types";
