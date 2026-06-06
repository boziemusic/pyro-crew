export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Dashboard
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          Continuity Crew command overview
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
          The dashboard will summarize active continuity issues, field
          verification status, technician assignments, and unresolved root-cause
          documentation for the current pyrotechnic display.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20">
          <h2 className="text-lg font-semibold text-white">
            Dispatch readiness
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#94a3b8]">
            Future responsibility: surface director-created continuity issues
            that need technician assignment.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20">
          <h2 className="text-lg font-semibold text-white">
            Verification queue
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#94a3b8]">
            Future responsibility: show issues awaiting director continuity
            re-checks after technician work.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20">
          <h2 className="text-lg font-semibold text-white">
            Closure control
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#94a3b8]">
            Future responsibility: highlight verified issues still waiting on
            technician root-cause documentation.
          </p>
        </div>
      </section>
    </div>
  );
}
