/* ─── PageHeader component ──────────────────────────────────────────────────
   Dark enterprise top banner. Title + subtitle + optional right slot.
   ─────────────────────────────────────────────────────────────────────────── */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Decorative left accent colour (CSS variable name or hex) */
  accent?: string;
}

export function PageHeader({ title, subtitle, actions, accent }: PageHeaderProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-4 shrink-0"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
        minHeight: 60,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Accent bar */}
        <div
          className="shrink-0 h-5 rounded-full"
          style={{
            width: 3,
            backgroundColor: accent ?? "var(--brand-orange)",
            boxShadow: `0 0 6px ${accent ?? "var(--brand-orange)"}`,
          }}
        />
        <div className="min-w-0">
          <h2
            className="text-base font-semibold leading-tight truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="text-xs mt-0.5 truncate"
              style={{ color: "var(--text-tertiary)" }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 ml-4">{actions}</div>
      )}
    </header>
  );
}
