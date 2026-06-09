export type ScriptAdapterKey = "cobra_6x";

export type ScriptAdapter = {
  key: ScriptAdapterKey;
  label: string;
  parse: (contents: string) => never;
};
