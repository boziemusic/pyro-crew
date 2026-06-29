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

type CobraFirmwareParserOptions = {
  displayLabel: string;
  firmware: "7" | "8";
  ignoredEventFirstCells?: string[];
};

function isFirmwareMarker(record: string[], firmware: string) {
  const marker = `#@firmware${firmware}`;

  return record.some(
    (value) => value.trim().toLowerCase() === marker,
  );
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

function isIgnoredEventRecord(
  record: string[],
  ignoredFirstCells: string[],
) {
  const normalizedFirstCell = getFirstNonBlankCell(record).toLowerCase();

  return ignoredFirstCells.includes(normalizedFirstCell);
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

export function parseCobraFirmwareCsv(
  contents: string,
  {
    displayLabel,
    firmware,
    ignoredEventFirstCells = [],
  }: CobraFirmwareParserOptions,
): ScriptParseResult {
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

  if (!records.some((record) => isFirmwareMarker(record, firmware))) {
    return {
      rows: [],
      skippedRowCount: 0,
      warnings: [],
      errors: [
        ...errors,
        `COBRA firmware${firmware} marker #@firmware${firmware} was not found.`,
      ],
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

      if (isIgnoredEventRecord(eventRecord, ignoredEventFirstCells)) {
        index = eventIndex;
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
        `COBRA firmware${firmware} event header row was not found.`,
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
          `Flattened ${eventTableCount} ${displayLabel} event table(s) across ${trackSectionCount} track section(s).`,
        ]
      : []),
  ];
  const resultErrors =
    rows.length === 0
      ? [
          ...errors,
          `COBRA firmware${firmware} script does not contain any valid event rows.`,
        ]
      : errors;

  return { rows, skippedRowCount, warnings, errors: resultErrors };
}

export function parseCobra7xCsv(contents: string): ScriptParseResult {
  return parseCobraFirmwareCsv(contents, {
    displayLabel: "COBRA 7.X",
    firmware: "7",
  });
}

export const cobra7xAdapter: ScriptAdapter = {
  key: "cobra_7x",
  label: "COBRA 7.X",
  parse: parseCobra7xCsv,
};

