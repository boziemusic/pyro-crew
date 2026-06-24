import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadScriptEventsModule() {
  const sourcePath = path.join(process.cwd(), "src/lib/script-events.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const moduleObject = { exports: {} };

  new Function("exports", "require", "module", output)(
    moduleObject.exports,
    () => {
      throw new Error("Unexpected runtime import in script events test.");
    },
    moduleObject,
  );

  return moduleObject.exports;
}

class FakeScriptEventsQuery {
  constructor(rows) {
    this.rows = rows;
  }

  select() {
    return this;
  }

  eq() {
    return this;
  }

  not() {
    return this;
  }

  order() {
    return this;
  }

  async range(from, to) {
    return {
      count: this.rows.length,
      data: this.rows.slice(from, to + 1),
      error: null,
    };
  }
}

const { fetchScriptPositionNames } = loadScriptEventsModule();
const expectedPositions = [
  ...Array.from({ length: 27 }, (_, index) => `CR${index + 1}`),
  ...Array.from({ length: 11 }, (_, index) => `SR${index + 1}`),
  ...Array.from({ length: 7 }, (_, index) => `F${index + 1}`),
  ...Array.from({ length: 7 }, (_, index) => `GAS${index + 1}`),
  ...Array.from({ length: 7 }, (_, index) => `SS${index + 1}`),
  ...Array.from({ length: 5 }, (_, index) => `CAKE${index + 1}`),
  ...Array.from({ length: 3 }, (_, index) => `BS${index + 1}`),
];
const rows = Array.from({ length: 1713 }, (_, index) => ({
  position_name: expectedPositions[index % expectedPositions.length],
})).sort((left, right) =>
  left.position_name.localeCompare(right.position_name, undefined, {
    numeric: true,
  }),
);
const supabase = {
  from(tableName) {
    assert.equal(tableName, "script_events");
    return new FakeScriptEventsQuery(rows);
  },
};

const { data, error, count } = await fetchScriptPositionNames(
  supabase,
  "show-id",
);
const uniquePositions = new Set(data.map((row) => row.position_name));

assert.equal(error, null);
assert.equal(count, 1713);
assert.equal(data.length, 1713);
assert.equal(uniquePositions.size, 67);

console.log("Script events pagination regression passed.");
