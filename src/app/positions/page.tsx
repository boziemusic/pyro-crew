export default function PositionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8">
      <section className="border border-[#d8e0e5] bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5f2e]">
          Positions
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[#111827]">
          Physical launch position reference
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#475569]">
          This page will manage physical launch positions on the display field
          and connect continuity issues to field locations when known or
          resolved from imported script data.
        </p>
      </section>
    </div>
  );
}
