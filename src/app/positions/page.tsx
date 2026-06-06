export default function PositionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Positions
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          Physical launch position reference
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
          This page will manage physical launch positions on the display field
          and connect continuity issues to field locations when known or
          resolved from imported script data.
        </p>
      </section>
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
        <h2 className="text-xl font-semibold text-white">
          Field position map placeholder
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#94a3b8]">
          Future responsibility: provide director and technician reference for
          physical launch positions, not crew roles or departments.
        </p>
      </section>
    </div>
  );
}
