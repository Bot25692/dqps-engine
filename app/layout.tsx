import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Topbar } from "@/components/topbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "A.D.A.P.T. — Decision Workspace",
  description:
    "Advertising Decision Automation for Profitable Targeting. DataQuest 3.0 — Team M.A.R.K.A.N.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="h-full flex flex-col md:flex-row antialiased bg-[var(--ink)] text-[var(--text)]">
        {/* Skip to main content accessibility link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:bg-[var(--surface-raised)] focus:border focus:border-[var(--orange)] focus:rounded-md"
        >
          Skip to content
        </a>

        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Content Column */}
        <div className="content-column pb-16 md:pb-0">
          <Topbar />
          <main id="main-content" className="main-content" tabIndex={-1}>
            {children}
            <footer className="page-footer">
              <span>
                A.D.A.P.T. <span className="footer-divider">/</span> Advertising Decision Automation for Profitable Targeting
              </span>
              <span>Enterprise Decision Intelligence · DataQuest 3.0</span>
            </footer>
          </main>
        </div>

        {/* Mobile Navigation Bar */}
        <MobileNav />
      </body>
    </html>
  );
}
