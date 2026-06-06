export default function TechnicianConsolePage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Technician Console
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          Assigned continuity issue workbench
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
          This page will focus each technician on their assigned continuity
          issue, field progress state, repair notes, awaiting-verification
          submission, and required root-cause documentation before closure.
        </p>
      </section>
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
        <h2 className="text-xl font-semibold text-white">
          Field response queue
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#94a3b8]">
          Future responsibility: focus one technician on assigned issues,
          progress state, parts retrieval, director assistance requests, and
          awaiting-verification submission.
        </p>
      </section>
    </div>
  );
}
