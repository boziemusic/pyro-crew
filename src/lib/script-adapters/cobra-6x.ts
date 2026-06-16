import type {
  ParsedScriptRow,
  ScriptAdapter,
  ScriptParseResult,
} from "./types";

export function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function parseCsvRecords(contents: string, includeBlankRows = false) {
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
    records: includeBlankRows
      ? records
      : records.filter((row) =>
          row.some((value) => value.trim().length > 0),
        ),
    errors,
  };
}

export function optionalValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function parseEventDescription(value: string | undefined) {
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

function isEventHeader(record: string[]) {
  const headers = new Set(record.map(normalizeHeader));

  return (
    headers.has("eventtime") &&
    headers.has("channel") &&
    headers.has("cue") &&
    headers.has("eventdescription")
  );
}

function getFirstNonBlankCell(record: string[]) {
  return record.find((value) => value.trim().length > 0)?.trim() ?? "";
}

function getTrackName(record: string[]) {
  const firstCell = getFirstNonBlankCell(record);

  return firstCell.toLowerCase().startsWith("#track")
    ? firstCell.replace(/^#+/, "").trim()
    : null;
}

function isMetadataOrHeaderRecord(record: string[]) {
  const firstCell = getFirstNonBlankCell(record);

  return firstCell.startsWith("#");
}

function parseEventRecord(
  record: string[],
  rawHeaders: string[],
  channelIndex: number,
  cueIndex: number,
  descriptionIndex: number,
  sourceTrackName: string | null,
) {
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

  if (sourceTrackName) {
    rawRow.__source_track = sourceTrackName;
  }

  return {
    channel_number: Number.isFinite(parsedChannel) ? parsedChannel : null,
    cue_value: optionalValue(record[cueIndex]),
    position_name: positionName,
    effect_name: effectName,
    raw_row: rawRow,
  } satisfies ParsedScriptRow;
}

export function parseCobra6xCsv(contents: string): ScriptParseResult {
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

  const parsedRows: ParsedScriptRow[] = [];
  let skippedRowCount = 0;
  let eventTableCount = 0;
  let trackSectionCount = 0;
  let currentTrackName: string | null = null;

  for (let index = 0; index < records.length; index += 1) {
    const trackName = getTrackName(records[index]);

    if (trackName) {
      currentTrackName = trackName;
      trackSectionCount += 1;
      continue;
    }

    if (!isEventHeader(records[index])) {
      continue;
    }

    eventTableCount += 1;

    const rawHeaders = records[index].map((header, headerIndex) =>
      header.trim() || `column_${headerIndex + 1}`,
    );
    const normalizedHeaders = rawHeaders.map(normalizeHeader);
    const channelIndex = normalizedHeaders.indexOf("channel");
    const cueIndex = normalizedHeaders.indexOf("cue");
    const descriptionIndex = normalizedHeaders.indexOf("eventdescription");

    for (
      let eventIndex = index + 1;
      eventIndex < records.length;
      eventIndex += 1
    ) {
      const eventRecord = records[eventIndex];

      if (isMetadataOrHeaderRecord(eventRecord)) {
        index = eventIndex - 1;
        break;
      }

      const parsedRow = parseEventRecord(
        eventRecord,
        rawHeaders,
        channelIndex,
        cueIndex,
        descriptionIndex,
        currentTrackName,
      );

      if (
        parsedRow.channel_number !== null &&
        parsedRow.cue_value !== null
      ) {
        parsedRows.push(parsedRow);
      } else {
        skippedRowCount += 1;
      }

      if (eventIndex === records.length - 1) {
        index = eventIndex;
      }
    }
  }

  if (eventTableCount === 0) {
    return {
      rows: [],
      skippedRowCount: 0,
      warnings: [],
      errors: [
        ...errors,
        "COBRA firmware6 event header row was not found.",
      ],
    };
  }

  const rows = parsedRows;
  const warnings = [
    ...(skippedRowCount > 0
      ? [`Skipped ${skippedRowCount} blank or invalid script row(s).`]
      : []),
    ...(trackSectionCount > 0 && eventTableCount > 1
      ? [
          `Flattened ${eventTableCount} COBRA 6.X event table(s) across ${trackSectionCount} track section(s).`,
        ]
      : []),
  ];
  const resultErrors =
    rows.length === 0
      ? [...errors, "COBRA script does not contain any valid event rows."]
      : errors;

  return { rows, skippedRowCount, warnings, errors: resultErrors };
}

export const cobra6xAdapter: ScriptAdapter = {
  key: "cobra_6x",
  label: "COBRA 6.X",
  parse: parseCobra6xCsv,
};
