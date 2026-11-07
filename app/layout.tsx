import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist } from "next/font/google";
import { siteUrl } from "@/lib/suite";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

const DESCRIPTION = "U.S. internships and entry-level jobs for university students, gathered into one search.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("internships")),
  title: "Internship Finder",
  description: DESCRIPTION,
  openGraph: { title: "Internship Finder", description: DESCRIPTION, url: "/", siteName: "Internship Finder", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
