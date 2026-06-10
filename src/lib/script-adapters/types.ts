export type ScriptAdapterKey = "cobra_6x";

export type ParsedScriptRow = {
  channel_number: number | null;
  cue_value: string | null;
  position_name: string | null;
  effect_name: string | null;
  raw_row: Record<string, string>;
};

export type ScriptParseResult = {
  rows: ParsedScriptRow[];
  warnings: string[];
  errors: string[];
};

export type ScriptAdapter = {
  key: ScriptAdapterKey;
  label: string;
  parse: (contents: string) => ScriptParseResult;
};
