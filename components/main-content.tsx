/* ─── MainContent wrapper ───────────────────────────────────────────────────
   Content block wrapper for page routes.
   ─────────────────────────────────────────────────────────────────────────── */

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MainContent({ children, className = "" }: MainContentProps) {
  return <div className={`space-y-6 ${className}`}>{children}</div>;
}
