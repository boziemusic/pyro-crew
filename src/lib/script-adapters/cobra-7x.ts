import type {
  ParsedScriptRow,
  ScriptAdapter,
  ScriptParseResult,
} from "./types";
import {
  normalizeHeader,
  optionalValue,
  parseCsvRecords,
  parseEventDescription,
} from "./cobra-6x";

export function parseCobra7xCsv(contents: string): ScriptParseResult {
  const { records, errors } = parseCsvRecords(
    contents.replace(/^\uFEFF/, ""),
    true,
  );

  if (records.length === 0) {
    return {
      rows: [],
      skippedRowCount: 0,
      warnings: [],
      errors: [...errors, "CSV file does not contain any rows."],
    };
  }

  const firmwareRow = records.find((record) =>
    record.some((value) => value.trim().toLowerCase() === "#@firmware7"),
  );

  if (!firmwareRow) {
    return {
      rows: [],
      skippedRowCount: 0,
      warnings: [],
      errors: [
        ...errors,
        "COBRA firmware7 marker #@firmware7 was not found.",
      ],
    };
  }

  const eventHeaderIndex = records.findIndex((record) => {
    const headers = new Set(record.map(normalizeHeader));

    return (
      headers.has("eventtime") &&
      headers.has("channel") &&
      headers.has("cue") &&
      headers.has("eventdescription")
    );
  });

  if (eventHeaderIndex < 0) {
    return {
      rows: [],
      skippedRowCount: 0,
      warnings: [],
      errors: [
        ...errors,
        "COBRA firmware7 event header row was not found.",
      ],
    };
  }

  const rawHeaders = records[eventHeaderIndex].map((header, index) =>
    header.trim() || `column_${index + 1}`,
  );
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const channelIndex = normalizedHeaders.indexOf("channel");
  const cueIndex = normalizedHeaders.indexOf("cue");
  const descriptionIndex = normalizedHeaders.indexOf("eventdescription");

  const eventRecords = records.slice(eventHeaderIndex + 1);
  const parsedRows = eventRecords.map<ParsedScriptRow>((record) => {
    const rawRow = Object.fromEntries(
      rawHeaders.map((header, index) => [
        header,
        record[index]?.trim() ?? "",
      ]),
    );
    const channelValue = optionalValue(record[channelIndex]);
    const parsedChannel =
      channelValue !== null ? Number(channelValue) : Number.NaN;
    const { effectName, positionName } = parseEventDescription(
      record[descriptionIndex],
    );

    return {
      channel_number: Number.isFinite(parsedChannel)
        ? parsedChannel
        : null,
      cue_value: optionalValue(record[cueIndex]),
      position_name: positionName,
      effect_name: effectName,
      raw_row: rawRow,
    };
  });
  const rows = parsedRows.filter(
    (row) => row.channel_number !== null && row.cue_value !== null,
  );
  const skippedRowCount = parsedRows.length - rows.length;
  const warnings =
    skippedRowCount > 0
      ? [`Skipped ${skippedRowCount} blank or invalid script row(s).`]
      : [];
  const resultErrors =
    rows.length === 0
      ? [
          ...errors,
          "COBRA firmware7 script does not contain any valid event rows.",
        ]
      : errors;

  return { rows, skippedRowCount, warnings, errors: resultErrors };
}

export const cobra7xAdapter: ScriptAdapter = {
  key: "cobra_7x",
  label: "COBRA 7.X",
  parse: parseCobra7xCsv,
};
