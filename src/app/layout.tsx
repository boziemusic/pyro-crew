import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pyro Crew",
  description: "Continuity Crew module coming online",
};

const navItems = [
  { href: "/shows", label: "Shows" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/director", label: "Director Console" },
  { href: "/technician", label: "Technician Console" },
  { href: "/positions", label: "Positions" },
  { href: "/issues", label: "Issues" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#f4f7f8] text-[#111827]">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-[#d8e0e5] bg-white/95">
            <nav className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
              <Link href="/" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center bg-[#ff5f2e] font-bold text-white">
                  PC
                </span>
                <span>
                  <span className="block text-lg font-semibold tracking-normal text-[#111827]">
                    Pyro Crew
                  </span>
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-[#64748b]">
                    Continuity Crew
                  </span>
                </span>
              </Link>
              <div className="flex flex-wrap gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="border border-[#d8e0e5] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] transition-colors hover:border-[#ff9a70] hover:bg-[#fff3ed] hover:text-[#9a3412]"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
