export default function DirectorConsolePage() {
  const fieldClassName =
    "border-2 border-[#94a3b8] bg-white px-3 py-3 text-base font-semibold text-[#0f172a] placeholder:text-[#475569] focus:border-[#ff5f2e] focus:outline-none focus:ring-2 focus:ring-[#fed7aa]";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8">
      <section className="border border-[#d8e0e5] bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff5f2e]">
          Director Console
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[#111827]">
          Continuity issue dispatch and verification
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#475569]">
          This console will let the director create issues from firing system
          continuity status, assign one technician, verify repairs, and control
          issue closure after root-cause documentation is complete.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-[#d8e0e5] bg-white p-6">
          <div className="flex flex-col gap-2 border-b border-[#e2e8f0] pb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Non-functional mockup
            </p>
            <h2 className="text-2xl font-semibold text-[#111827]">
              New continuity issue entry
            </h2>
            <p className="text-sm leading-6 text-[#64748b]">
              The active show will determine whether the scripted or manual
              issue-entry workflow is exposed.
            </p>
          </div>

          <div className="mt-6 grid gap-5">
            <div className="border border-[#cbd5e1] bg-[#f8fafc] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                Active Show
              </p>
              <p className="mt-2 text-2xl font-semibold text-[#111827]">
                Active Show: None Selected.
              </p>
              <p className="mt-3 text-sm leading-6 text-[#64748b]">
                Select a show from the Shows page to expose the correct
                scripted or manual Director Console workflow.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#334155]">
                  CH / Module
                </span>
                <input
                  className={fieldClassName}
                  placeholder="Required"
                  type="text"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#334155]">
                  Cue(s)
                </span>
                <input
                  className={fieldClassName}
                  placeholder="Required"
                  type="text"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#334155]">
                  Issue Type / Derived Issue
                </span>
                <select className={fieldClassName} defaultValue="">
                  <option value="" disabled>
                    Select or derive later
                  </option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#334155]">
                Position
              </span>
              <input
                className={fieldClassName}
                placeholder="Optional for manual shows"
                type="text"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="border border-[#fed7aa] bg-[#fff7ed] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#c2410c]">
                  Scripted Show behavior
                </p>
                <p className="mt-3 text-sm leading-6 text-[#7c2d12]">
                  Director enters only CH / Module and Cue(s). The system
                  resolves position and effect from imported script data, then
                  derives whether the issue is No Continuity or Shows
                  Continuity But Not Present In Script.
                </p>
              </div>
              <div className="border border-[#99f6e4] bg-[#f0fdfa] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0f766e]">
                  Manual Show behavior
                </p>
                <p className="mt-3 text-sm leading-6 text-[#134e4a]">
                  Director enters CH / Module and Cue(s). Position is optional.
                  Issue Type may be selected by the director or defaulted later
                  in the workflow.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#e2e8f0] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-[#475569]">
                Submit Issue is currently non-functional. It will eventually
                create a continuity issue record for director dispatch and
                verification.
              </p>
              <button
                className="bg-[#ff5f2e] px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#dc4b20]"
                type="button"
              >
                Submit Issue
              </button>
            </div>
          </div>
        </div>

        <aside className="border border-[#d8e0e5] bg-[#111827] p-6 text-white">
          <h2 className="text-xl font-semibold">Workflow states</h2>
          <ol className="mt-5 grid gap-3 text-sm leading-6 text-[#dbeafe]">
            <li>Director creates issue from firing system status.</li>
            <li>Director assigns the issue to one technician.</li>
            <li>Technician marks in progress and records field status.</li>
            <li>Technician submits awaiting verification.</li>
            <li>Director re-checks continuity.</li>
            <li>Issue becomes verification_failed or verified_resolved.</li>
            <li>Technician documents root cause before closure.</li>
          </ol>
        </aside>
      </section>
    </div>
  );
}
