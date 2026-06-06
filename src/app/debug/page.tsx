import { connection } from "next/server";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default async function DebugPage() {
  await connection();

  let isSuccessful = false;
  let rowCount = 0;
  let errorMessage = "None";

  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("shows").select("id").limit(1);

    isSuccessful = !error;
    rowCount = data?.length ?? 0;
    errorMessage = error?.message ?? "None";
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unknown Supabase connection error";
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Debug
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          Supabase connection test
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
          Read-only check against the existing public.shows table.
        </p>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-[#070b18] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              Connection
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {isSuccessful ? "Connection successful" : "Connection failed"}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#070b18] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              Row count returned
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">{rowCount}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#070b18] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              Supabase error
            </p>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#dbe4ef]">
              {errorMessage}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
