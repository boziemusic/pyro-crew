"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { AppFeedbackControls } from "./app-feedback-controls";
import { ActiveShowStrip, useActiveShow } from "./active-show-strip";
import { useActiveContinuitySession } from "./active-continuity-session";

const navItems = [
  { href: "/shows", label: "Shows", protected: false },
  { href: "/director", label: "Director Console", protected: true },
  { href: "/technician", label: "Technician Console", protected: true },
  { href: "/issues", label: "Issues", protected: true },
  { href: "/positions", label: "Positions", protected: true },
];

const protectedRoutes = ["/director", "/technician", "/issues", "/positions"];

export function MissionControlShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeShow = useActiveShow();
  const activeSession = useActiveContinuitySession();
  const hasActiveSession =
    activeSession?.show_id === activeShow?.id &&
    activeSession?.status === "active";
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isBlocked = isProtectedRoute && !activeShow;
  const isTechnicianRoute =
    pathname === "/technician" || pathname.startsWith("/technician/");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1f1140_0,#050816_36%,#020617_100%)]">
      <header
        className={`${isTechnicianRoute ? "hidden md:block" : ""} sticky top-0 z-20 border-b border-white/10 bg-[#070b18]/95 shadow-2xl shadow-black/25 backdrop-blur`}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 xl:flex-row xl:items-center xl:justify-between">
          <Link
            href="/shows"
            className="flex min-h-11 touch-manipulation items-center gap-3"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#4c00a4] font-bold text-white shadow-lg shadow-[#4c00a4]/35">
              PC
            </span>
            <span>
              <span className="block text-lg font-semibold tracking-normal text-white">
                Pyro Crew
              </span>
              <span className="block text-xs font-medium uppercase tracking-[0.18em] text-[#94a3b8]">
                Continuity Crew
              </span>
            </span>
          </Link>
          <nav className="hidden gap-2 overflow-x-auto md:flex">
            {navItems.map((item) => {
              const isDisabled = item.protected && !activeShow;
              const className =
                "whitespace-nowrap rounded-lg border px-4 py-3 text-sm font-semibold transition-colors";

              if (isDisabled) {
                return (
                  <span
                    aria-disabled="true"
                    className={`${className} cursor-not-allowed border-white/5 bg-[#090d18] text-[#566274] opacity-70`}
                    key={item.href}
                    title="Select an active show first"
                  >
                    {item.label}
                  </span>
                );
              }

              return (
                <Link
                  className={`${className} border-white/10 bg-[#0d1324] text-[#dbe4ef] hover:border-[#8b5cf6] hover:bg-[#17102c] hover:text-white`}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
            <AppFeedbackControls />
          </nav>
          <nav className="grid grid-cols-2 gap-2 md:hidden">
            <Link
              className="flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-white/10 bg-[#0d1324] px-4 py-3 text-sm font-semibold text-[#dbe4ef] active:border-[#8b5cf6] active:bg-[#17102c]"
              href="/shows"
            >
              Shows
            </Link>
            {activeShow && hasActiveSession ? (
              <Link
                className="flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-[#8b5cf6]/40 bg-[#17102c] px-4 py-3 text-sm font-semibold text-white active:bg-[#211044]"
                href="/technician"
              >
                Technician
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="flex min-h-11 items-center justify-center rounded-lg border border-white/5 bg-[#090d18] px-4 py-3 text-sm font-semibold text-[#566274]"
              >
                Technician
              </span>
            )}
          </nav>
        </div>
        <ActiveShowStrip />
      </header>
      <main className="flex-1">
        {isBlocked ? (
          <div className="mx-auto flex w-full max-w-7xl px-5 py-8 sm:px-8">
            <section className="w-full rounded-lg border border-[#4c00a4]/40 bg-[#130a2b]/90 p-6 shadow-xl shadow-black/20">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c4b5fd]">
                Active show required
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-white">
                Select an active show before entering continuity issues.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b6c3d1]">
                Choose a show from the Shows page before opening this operational
                workspace.
              </p>
              <Link
                className="mt-5 inline-flex rounded-lg bg-[#6d28d9] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]"
                href="/shows"
              >
                Go to Shows
              </Link>
            </section>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
