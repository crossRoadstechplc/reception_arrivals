import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: {
    default: "Arrival Desk",
    template: "%s · Arrival Desk",
  },
  description: "Guest lists for reception and each floor.",
  robots: { index: false, follow: false },
  // Lets iPhones run it full-screen from the Home Screen, which iOS requires for push.
  appleWebApp: { capable: true, title: "Arrival Desk", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#14201b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${plex.variable} h-full antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
