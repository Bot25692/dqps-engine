/* ─── MainContent container ───────────────────────────────────────────────── */
/* Wraps page body content with consistent padding and max-width.              */
/* Every page's primary content (cards, tables, charts) renders inside this.  */

interface MainContentProps {
  children: React.ReactNode;
  /** Extra Tailwind classes to pass through (e.g. "grid grid-cols-2") */
  className?: string;
}

export function MainContent({ children, className = "" }: MainContentProps) {
  return (
    <main className={`flex-1 p-6 ${className}`}>
      {children}
    </main>
  );
}
