export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8">
      <section className="border border-[#d8e0e5] bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5f2e]">
          Dashboard
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[#111827]">
          Continuity Crew command overview
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#475569]">
          The dashboard will summarize active continuity issues, field
          verification status, technician assignments, and unresolved root-cause
          documentation for the current pyrotechnic display.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="border border-[#d8e0e5] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111827]">
            Dispatch readiness
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#64748b]">
            Future responsibility: surface director-created continuity issues
            that need technician assignment.
          </p>
        </div>
        <div className="border border-[#d8e0e5] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111827]">
            Verification queue
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#64748b]">
            Future responsibility: show issues awaiting director continuity
            re-checks after technician work.
          </p>
        </div>
        <div className="border border-[#d8e0e5] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111827]">
            Closure control
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#64748b]">
            Future responsibility: highlight verified issues still waiting on
            technician root-cause documentation.
          </p>
        </div>
      </section>
    </div>
  );
}
