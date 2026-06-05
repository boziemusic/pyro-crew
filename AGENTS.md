<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Pyro Crew Project Definition

Pyro Crew is the platform.

Continuity Crew is the first module.

Continuity Crew is not a generic task/checklist app. It is a continuity issue dispatch, verification, and root-cause tracking system for pyrotechnic display fields.

A "Position" means a physical launch position on the field, not a job role or work department.

## Core Continuity Crew Workflow

1. Director creates a continuity issue from firing system status.
2. Issue includes channel/module, cue/cues/cue range, position if known, issue type, and optional effect name.
3. Director assigns the issue to one technician.
4. Technician marks the issue in progress.
5. Technician may mark retrieving parts, director assistance requested, additional technician requested, or unfixable recommended.
6. Technician submits the issue as awaiting verification.
7. Director re-checks continuity.
8. If still bad, status becomes verification_failed.
9. If fixed, status becomes verified_resolved.
10. Technician must complete root-cause documentation before the issue becomes closed.

## Product Boundaries

Do not build generic crew checklists, product sorting, rack building, or unrelated setup task features unless explicitly requested.

Use Next.js, TypeScript, Tailwind, and Supabase.

Do not change database schema unless explicitly instructed.
