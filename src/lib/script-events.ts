import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedScriptRow } from "@/lib/script-adapters";

export type ScriptEventRow = {
  id?: string;
  show_id: string;
  channel_number: number;
  cue_value: string;
  position_name: string | null;
  effect_name: string | null;
  raw_row: Record<string, string> | null;
  created_at?: string;
};

type ScriptEventInsert = Omit<ScriptEventRow, "id" | "created_at">;
type ScriptPositionNameRow = {
  position_name: string | null;
};

const SCRIPT_EVENT_PAGE_SIZE = 1000;

export function normalizeScriptEventRows(
  showId: string,
  rows: ParsedScriptRow[],
) {
  const validRows = rows.filter(
    (row) => row.channel_number !== null && row.cue_value !== null,
  );
  const skippedRowCount = rows.length - validRows.length;

  if (validRows.length === 0) {
    throw new Error(
      "The parsed script does not contain any valid events to store.",
    );
  }

  return {
    inserts: validRows.map<ScriptEventInsert>((row) => ({
      show_id: showId,
      channel_number: row.channel_number as number,
      cue_value: row.cue_value as string,
      position_name: row.position_name,
      effect_name: row.effect_name,
      raw_row: row.raw_row,
    })),
    skippedRowCount,
  };
}

export async function fetchScriptEvents(
  supabase: SupabaseClient,
  showId: string,
) {
  const rows: ScriptEventRow[] = [];
  let rangeStart = 0;
  let totalCount: number | null = null;

  while (true) {
    const { data, error, count } = await supabase
      .from("script_events")
      .select(
        "id, show_id, channel_number, cue_value, position_name, effect_name, raw_row, created_at",
        { count: "exact" },
      )
      .eq("show_id", showId)
      .order("created_at", { ascending: true })
      .range(rangeStart, rangeStart + SCRIPT_EVENT_PAGE_SIZE - 1);

    if (error) {
      return { data: null, error, count: count ?? totalCount };
    }

    const pageRows = (data ?? []) as ScriptEventRow[];

    if (totalCount === null && typeof count === "number") {
      totalCount = count;
    }

    rows.push(...pageRows);

    if (pageRows.length < SCRIPT_EVENT_PAGE_SIZE) {
      return { data: rows, error: null, count: totalCount };
    }

    rangeStart += SCRIPT_EVENT_PAGE_SIZE;
  }
}

export async function fetchScriptEventPreview(
  supabase: SupabaseClient,
  showId: string,
) {
  return supabase
    .from("script_events")
    .select(
      "id, show_id, channel_number, cue_value, position_name, effect_name, raw_row, created_at",
      { count: "exact" },
    )
    .eq("show_id", showId)
    .order("created_at", { ascending: true })
    .limit(5);
}

export async function fetchScriptPositionNames(
  supabase: SupabaseClient,
  showId: string,
) {
  const rows: ScriptPositionNameRow[] = [];
  let rangeStart = 0;
  let totalCount: number | null = null;

  while (true) {
    const { data, error, count } = await supabase
      .from("script_events")
      .select("position_name", { count: "exact" })
      .eq("show_id", showId)
      .not("position_name", "is", null)
      .order("position_name", { ascending: true })
      .range(rangeStart, rangeStart + SCRIPT_EVENT_PAGE_SIZE - 1);

    if (error) {
      return { data: null, error, count: count ?? totalCount };
    }

    const pageRows = (data ?? []) as ScriptPositionNameRow[];

    if (totalCount === null && typeof count === "number") {
      totalCount = count;
    }

    rows.push(...pageRows);

    if (pageRows.length < SCRIPT_EVENT_PAGE_SIZE) {
      return { data: rows, error: null, count: totalCount };
    }

    rangeStart += SCRIPT_EVENT_PAGE_SIZE;
  }
}

export async function restoreScriptEvents(
  supabase: SupabaseClient,
  showId: string,
  previousRows: ScriptEventRow[],
) {
  const { error: deleteError } = await supabase
    .from("script_events")
    .delete()
    .eq("show_id", showId);

  if (deleteError) {
    return deleteError;
  }

  if (previousRows.length === 0) {
    return null;
  }

  const { error: restoreError } = await supabase
    .from("script_events")
    .insert(
      previousRows.map((row) => ({
        show_id: row.show_id,
        channel_number: row.channel_number,
        cue_value: row.cue_value,
        position_name: row.position_name,
        effect_name: row.effect_name,
        raw_row: row.raw_row,
      })),
    );

  return restoreError;
}

export async function replaceScriptEvents(
  supabase: SupabaseClient,
  showId: string,
  rows: ParsedScriptRow[],
) {
  const { inserts, skippedRowCount } = normalizeScriptEventRows(
    showId,
    rows,
  );
  const { data: existingData, error: readError } = await fetchScriptEvents(
    supabase,
    showId,
  );

  if (readError) {
    throw new Error(`Could not snapshot existing script events: ${readError.message}`);
  }

  const previousRows = (existingData ?? []) as ScriptEventRow[];
  const { error: deleteError } = await supabase
    .from("script_events")
    .delete()
    .eq("show_id", showId);

  if (deleteError) {
    throw new Error(`Could not replace existing script events: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase
    .from("script_events")
    .insert(inserts);

  if (insertError) {
    const restoreError = await restoreScriptEvents(
      supabase,
      showId,
      previousRows,
    );

    throw new Error(
      restoreError
        ? `New script events could not be inserted, and previous rows could not be restored: ${insertError.message}; restore failed: ${restoreError.message}`
        : `New script events could not be inserted. Previous rows were restored: ${insertError.message}`,
    );
  }

  return {
    insertedRowCount: inserts.length,
    previousRows,
    skippedRowCount,
  };
}

export async function findScriptEvent(
  supabase: SupabaseClient,
  showId: string,
  channelNumber: number,
  cueValue: string,
) {
  return supabase
    .from("script_events")
    .select(
      "id, show_id, channel_number, cue_value, position_name, effect_name, raw_row, created_at",
    )
    .eq("show_id", showId)
    .eq("channel_number", channelNumber)
    .eq("cue_value", cueValue.trim())
    .limit(1)
    .maybeSingle();
}

export async function findFirstScriptEventForChannel(
  supabase: SupabaseClient,
  showId: string,
  channelNumber: number,
) {
  return supabase
    .from("script_events")
    .select(
      "id, show_id, channel_number, cue_value, position_name, effect_name, raw_row, created_at",
    )
    .eq("show_id", showId)
    .eq("channel_number", channelNumber)
    .order("created_at", { ascending: true })
    .order("cue_value", { ascending: true })
    .limit(1)
    .maybeSingle();
}
