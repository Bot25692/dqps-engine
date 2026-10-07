import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

/* Load JetBrains Mono for numeric/monospaced treatments */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "A.D.A.P.T. — Advertising Decision Automation for Profitable Targeting",
  description:
    "D2C advertising decision intelligence engine. DataQuest 3.0 — Team M.A.R.K.A.N.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${jetbrainsMono.variable}`}>
      <body className="h-full flex antialiased" style={{ backgroundColor: "var(--bg-base)" }}>
        {/* Fixed sidebar */}
        <Sidebar />

        {/* Scrollable main area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
