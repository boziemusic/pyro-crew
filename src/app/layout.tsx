import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MissionControlShell } from "@/components/mission-control-shell";
import { PwaServiceWorkerRegistration } from "@/components/pwa-service-worker-registration";
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
  title: "Pyro Crew Continuity",
  description: "Continuity issue dispatch, verification, and root-cause tracking for pyrotechnic display fields.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Continuity",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/pwa-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  initialScale: 1,
  themeColor: "#6d28d9",
  width: "device-width",
};

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
      <body className="min-h-full bg-[#050816] text-[#f8fafc]">
        <PwaServiceWorkerRegistration />
        <MissionControlShell>{children}</MissionControlShell>
      </body>
    </html>
  );
}
