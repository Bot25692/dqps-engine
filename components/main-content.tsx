/* ─── MainContent wrapper ───────────────────────────────────────────────────
   Scrollable padded content area on the dark surface.
   ─────────────────────────────────────────────────────────────────────────── */

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MainContent({ children, className = "" }: MainContentProps) {
  return (
    <main
      className={`flex-1 px-6 py-5 space-y-5 ${className}`}
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      {children}
    </main>
  );
}
