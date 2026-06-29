import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadScriptAdapterModule(modulePath) {
  const moduleCache = new Map();

  function load(resolvedPath) {
    if (moduleCache.has(resolvedPath)) {
      return moduleCache.get(resolvedPath).exports;
    }

    const source = fs.readFileSync(resolvedPath, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    const moduleObject = { exports: {} };
    moduleCache.set(resolvedPath, moduleObject);

    const localRequire = (specifier) => {
      if (!specifier.startsWith(".")) {
        throw new Error(`Unexpected runtime import: ${specifier}`);
      }

      return load(path.join(path.dirname(resolvedPath), `${specifier}.ts`));
    };

    new Function("exports", "require", "module", output)(
      moduleObject.exports,
      localRequire,
      moduleObject,
    );

    return moduleObject.exports;
  }

  return load(path.join(process.cwd(), modulePath));
}

const { parseCobra8xCsv } = loadScriptAdapterModule(
  "src/lib/script-adapters/cobra-8x.ts",
);
const csvPath =
  "C:/Users/domes/My Drive/Pyro/Domescik Family Displays/Stolberg Lake/2026 (Guile's Theme)/Scripts/GuilesTheme_v1.3_8.0.csv";
const result = parseCobra8xCsv(fs.readFileSync(csvPath, "utf8"));
const positions = [
  ...new Set(result.rows.map((row) => row.position_name).filter(Boolean)),
];
const prefixCounts = positions.reduce((counts, position) => {
  const prefix = position.match(/^[A-Za-z]+/)?.[0] ?? "";
  counts[prefix] = (counts[prefix] ?? 0) + 1;
  return counts;
}, {});
const firstRawRow = result.rows[0]?.raw_row ?? {};

assert.deepEqual(result.errors, []);
assert.equal(result.rows.length, 606);
assert.equal(result.skippedRowCount, 0);
assert.equal(positions.length, 33);
assert.deepEqual(prefixCounts, { CAKE: 5, F: 28 });
assert.equal(firstRawRow["#Event Time"], "00:00:07.14s");
assert.equal(firstRawRow["#Disable Groups"], "");
assert.equal(firstRawRow["#Fire Time"], "");
assert.equal(firstRawRow["#DMX Ramp-From Value"], "");
assert.equal(firstRawRow["#DMX Universe"], "");
assert.equal(firstRawRow["#DMX Channel"], "");
assert.equal(firstRawRow["#DMX Value"], "");
assert.equal(firstRawRow["#DMX Duration"], "");

console.log("COBRA 8.0 parser attached-file regression passed.");

