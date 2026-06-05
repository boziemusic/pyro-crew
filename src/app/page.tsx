import { isSupabaseConfigured } from "@/lib/supabase";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 items-center bg-[#101418] px-6 py-16 text-white sm:px-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <div className="h-1 w-20 bg-[#ff6b2f]" />
        <div className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb38c]">
            Continuity systems
          </p>
          <h1 className="text-5xl font-semibold tracking-normal text-white sm:text-7xl">
            Pyro Crew
          </h1>
          <p className="max-w-2xl text-xl leading-8 text-[#d4dde6]">
            Continuity Crew module coming online
          </p>
        </div>
        <div className="w-fit border border-[#38424d] bg-[#171d23] px-5 py-4 shadow-2xl shadow-black/20">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#91a2b3]">
            Supabase configured
          </p>
          <p className="mt-2 text-3xl font-semibold text-[#f8fafc]">
            {isSupabaseConfigured ? "Yes" : "No"}
          </p>
        </div>
      </section>
    </main>
  );
}
