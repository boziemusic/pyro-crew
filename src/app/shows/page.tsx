export default function ShowsPage() {
  const fieldClassName =
    "border-2 border-[#94a3b8] bg-white px-3 py-3 text-base font-semibold text-[#0f172a] placeholder:text-[#475569] focus:border-[#ff5f2e] focus:outline-none focus:ring-2 focus:ring-[#fed7aa]";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8">
      <section className="border border-[#d8e0e5] bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5f2e]">
          Shows
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[#111827]">
          Show setup and workflow mode
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#475569]">
          Shows are the starting point for Continuity Crew. Show Type controls
          which Director Console workflow is exposed: scripted shows rely on
          imported script data for position and effect resolution, while manual
          shows allow field references to be entered directly.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="border border-[#d8e0e5] bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#64748b]">
            Non-functional show list placeholder
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[#111827]">
            Show list
          </h2>
          <div className="mt-6 border border-dashed border-[#94a3b8] bg-[#f8fafc] p-6">
            <p className="text-base font-semibold text-[#334155]">
              No shows are displayed yet.
            </p>
            <p className="mt-2 text-sm leading-6 text-[#64748b]">
              This area will eventually list available shows and let the
              director choose the active show for continuity issue entry.
            </p>
          </div>
        </div>

        <div className="border border-[#d8e0e5] bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#64748b]">
            Non-functional mockup
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[#111827]">
            New Show
          </h2>
          <div className="mt-6 grid gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#334155]">
                Show Name
              </span>
              <input
                className={fieldClassName}
                placeholder="Required"
                type="text"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#334155]">
                  Show Type
                </span>
                <select className={fieldClassName} defaultValue="">
                  <option value="" disabled>
                    Scripted or Manual
                  </option>
                  <option value="scripted">Scripted</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#334155]">
                  Show Date
                </span>
                <input className={fieldClassName} type="date" />
              </label>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#334155]">
                Script Upload
              </span>
              <div className="border-2 border-dashed border-[#94a3b8] bg-[#f8fafc] px-4 py-6">
                <p className="text-base font-semibold text-[#334155]">
                  Script upload placeholder
                </p>
                <p className="mt-2 text-sm leading-6 text-[#64748b]">
                  Future scripted shows will import script data here. Manual
                  shows can proceed without a script upload.
                </p>
              </div>
            </label>
            <div className="flex flex-col gap-3 border-t border-[#e2e8f0] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-[#475569]">
                This form is currently non-functional and does not create a
                show record.
              </p>
              <button
                className="bg-[#ff5f2e] px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#dc4b20]"
                type="button"
              >
                Create Show
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
