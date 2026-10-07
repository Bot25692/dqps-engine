/* ─── PageHeader component ────────────────────────────────────────────────── */
/* Renders the top banner for every page: title, subtitle, and an optional     */
/* right-side slot for actions (buttons, badges, etc.).                        */

interface PageHeaderProps {
  /** Main page title */
  title: string;
  /** Short description shown below the title */
  subtitle?: string;
  /** Optional right-aligned content (e.g. action buttons) */
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between px-6 py-5 border-b bg-white">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 ml-4">{actions}</div>
      )}
    </header>
  );
}
