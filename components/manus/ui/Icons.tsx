import type { ReactNode, SVGProps } from "react";

export type IconName = "overview" | "campaigns" | "recommendations" | "learning" | "revenue" | "spend" | "profit" | "roas" | "arrow" | "arrowUp" | "check" | "warning" | "cube" | "trend" | "clock" | "spark";

const paths: Record<IconName, ReactNode> = {
  overview: <path d="M3.5 3.5h7v7h-7zM13.5 3.5h7v5h-7zM13.5 10.5h7v10h-7zM3.5 13.5h7v7h-7z" />,
  campaigns: <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M8 4.5v5M16 4.5v5M8 14h3m-3 3h8" /></>,
  recommendations: <><path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" /></>,
  learning: <><path d="M5.5 3h14v18h-14A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3Z" /><path d="M3 18.5A2.5 2.5 0 0 1 5.5 16H20M8 7h7M8 10.5h7" /></>,
  revenue: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h.01M17 15h.01M9 10h6M9 14h6" /></>,
  spend: <><path d="M12 2.5v19M17.5 5.5H9.2a3.3 3.3 0 0 0 0 6.6h5.6a3.3 3.3 0 0 1 0 6.6H6.5" /></>,
  profit: <><path d="M5 7h14M5 12h14M5 17h14" /><path d="M8 4v16M16 4v16" /></>,
  roas: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v2m9 7h-2m-7 9v-2m-9-7h2" /></>,
  arrow: <><path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5" /></>,
  arrowUp: <><path d="M7 17 17 7M7 7h10v10" /></>,
  check: <><path d="m5 12 4.5 4.5L19 7" /></>,
  warning: <><path d="m10.3 3.7-8 14A2 2 0 0 0 4 20.8h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3.5h.01" /></>,
  cube: <><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3Z" /><path d="m3.8 7.7 8.2 4.5 8.2-4.5M12 12.2V21" /></>,
  trend: <><path d="M4 18V6m0 12h16" /><path d="m7 14 3-3 3 2 5-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  spark: <><path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
};

export function Icon({ name, className, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>{paths[name]}</svg>;
}

export function AdeptMark({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 42 42" className={className} fill="none">
    <path d="M21 4.5 37 34H5L21 4.5Z" stroke="currentColor" strokeWidth="1.35" />
    <path d="M13.5 21.5h15M16.5 16.5h9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    <path d="M21 4.5v10.5" stroke="currentColor" strokeWidth="1.35" />
  </svg>;
}
