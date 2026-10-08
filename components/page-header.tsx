/* ─── PageHeader component ──────────────────────────────────────────────────
   Enterprise page heading banner matching Manus UI specifications.
   ─────────────────────────────────────────────────────────────────────────── */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  accent?: string;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow = "DECISION INTELLIGENCE",
  actions,
}: PageHeaderProps) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle && <p className="page-description">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <div className="page-heading-mark" aria-hidden="true">
          <span>Δ</span>
        </div>
      </div>
    </div>
  );
}
