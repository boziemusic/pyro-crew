import { cobra6xAdapter } from "./cobra-6x";
import { cobra7xAdapter } from "./cobra-7x";
import type { ScriptAdapter, ScriptAdapterKey } from "./types";

export const SCRIPT_ADAPTERS: Record<ScriptAdapterKey, ScriptAdapter> = {
  cobra_6x: cobra6xAdapter,
  cobra_7x: cobra7xAdapter,
};

export type {
  ParsedScriptRow,
  ScriptAdapter,
  ScriptAdapterKey,
  ScriptParseResult,
} from "./types";
