import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ProviderBanner } from "@/components/ProviderBanner";

const NAME = process.env.CS_PRODUCT_NAME || "Curiosity Studio";

export const metadata: Metadata = {
  title: { default: NAME, template: `%s · ${NAME}` },
  description: "Plan, write, check and export illustrated curiosity worksheets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className="min-h-screen">
        <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 bg-card px-3 py-2 rounded">
          Skip to content
        </a>
        <header className="border-b border-line bg-card">
          <div className="mx-auto max-w-[1500px] flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-display text-xl font-semibold tracking-tight">
              {NAME}
            </Link>
            <nav aria-label="Main" className="flex gap-4 text-sm font-semibold">
              <Link href="/" className="hover:underline">
                Worksheets
              </Link>
              <Link href="/new" className="hover:underline">
                New worksheet
              </Link>
              <Link href="/workbooks" className="hover:underline">
                Workbooks
              </Link>
            </nav>
            <div className="ml-auto">
              <ProviderBanner />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1500px] px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
