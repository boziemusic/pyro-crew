import type {
  ParsedScriptRow,
  ScriptAdapter,
  ScriptParseResult,
} from "./types";

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsvRecords(contents: string) {
  const records: string[][] = [];
  const errors: string[] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];

    if (inQuotes) {
      if (character === '"') {
        if (contents[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    errors.push("CSV contains an unterminated quoted field.");
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }

  return {
    records: records.filter((row) =>
      row.some((value) => value.trim().length > 0),
    ),
    errors,
  };
}

function optionalValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function parseEventDescription(value: string | undefined) {
  const description = optionalValue(value);

  if (!description) {
    return { effectName: null, positionName: null };
  }

  const separatorIndex = description.indexOf(" // ");

  if (separatorIndex < 0) {
    return { effectName: description, positionName: null };
  }

  return {
    effectName: optionalValue(description.slice(0, separatorIndex)),
    positionName: optionalValue(description.slice(separatorIndex + 4)),
  };
}

export function parseCobra6xCsv(contents: string): ScriptParseResult {
  const { records, errors } = parseCsvRecords(contents.replace(/^\uFEFF/, ""));

  if (records.length === 0) {
    return {
      rows: [],
      warnings: [],
      errors: [...errors, "CSV file does not contain any rows."],
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
      warnings: [],
      errors: [
        ...errors,
        "COBRA firmware6 event header row was not found.",
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

  const rows = records
    .slice(eventHeaderIndex + 1)
    .map<ParsedScriptRow>((record) => {
    const rawRow = Object.fromEntries(
      rawHeaders.map((header, index) => [header, record[index]?.trim() ?? ""]),
    );
    const channelValue = optionalValue(record[channelIndex]);
    const parsedChannel =
      channelValue !== null ? Number(channelValue) : Number.NaN;
    const { effectName, positionName } = parseEventDescription(
      record[descriptionIndex],
    );

    return {
      channel_number: Number.isFinite(parsedChannel) ? parsedChannel : null,
      cue_value: optionalValue(record[cueIndex]),
      position_name: positionName,
      effect_name: effectName,
      raw_row: rawRow,
    };
  });

  return { rows, warnings: [], errors };
}

export const cobra6xAdapter: ScriptAdapter = {
  key: "cobra_6x",
  label: "COBRA 6.X",
  parse: parseCobra6xCsv,
};
