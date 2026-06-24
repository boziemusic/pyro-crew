import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadCobra6xParser() {
  const sourcePath = path.join(
    process.cwd(),
    "src/lib/script-adapters/cobra-6x.ts",
  );
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
      throw new Error("Unexpected runtime import in COBRA parser test.");
    },
    moduleObject,
  );

  return moduleObject.exports.parseCobra6xCsv;
}

const parseCobra6xCsv = loadCobra6xParser();
const csv = [
  "#@firmware6,,,,,,,,,,",
  "#Event Time,#Channel,#Cue,#Event Description,#Disable Groups,#Fire Time,#AUX Value,#DMX Universe,#DMX Channel,#DMX Value,#DMX Duration",
  "00:00:04.82s,29,1,Flame - 60 Sec 0.5M Color Torch-White {RA8024} // F4,,,,,,,",
  "00:00:37.54s,36,1,Gas Mine-5 Gallon {12x20 Gas Mine} // GAS5,,,,,,,",
  "00:01:01.29s,94,1,Silver Strobing Willow {FK-4-SSW} // SS4,,,,,,,",
  "00:01:04.68s,12,1,11S Blue Tail Salute w/ Red Strobe Mine {WPL25SC11-06- // SR1B,,,,,,,",
  "00:01:13.86s,1,18,3-Layer Red Strobe & White & Blue Mine {PSS058} // CR1A,,,,,,,",
  "00:01:23.01s,49,3,Pyro Pulsar {Pyro Pulsar}//CAKE5,,,,,,,",
  "00:02:00.00s,88,2,Black Smoke Mine {SMK-BLK} //BS2,,,,,,,",
].join("\n");

const result = parseCobra6xCsv(csv);
const positions = result.rows.map((row) => row.position_name);

assert.deepEqual(result.errors, []);
assert.deepEqual(positions, [
  "F4",
  "GAS5",
  "SS4",
  "SR1B",
  "CR1A",
  "CAKE5",
  "BS2",
]);

console.log("COBRA 6.X parser position extraction regression passed.");
