"use client";

import { usePathname } from "next/navigation";
import { DatasetSelector } from "./dataset-selector";

const routeMeta: Record<string, { title: string; iconPath: string }> = {
  "/": {
    title: "Overview",
    iconPath: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  },
  "/campaigns": {
    title: "Campaigns",
    iconPath:
      "M3 4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4zm0 5h18M8 4v5M16 4v5M8 14h3M8 17h8",
  },
  "/recommendations": {
    title: "Recommendations",
    iconPath: "M12 3 3.5 7.5 12 12l8.5-4.5L12 3ZM4 12l8 4.3 8-4.3M4 16.5l8 4 8-4",
  },
  "/learning": {
    title: "Learning",
    iconPath:
      "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2ZM9 7h6M9 11h6",
  },
};

export function Topbar() {
  const pathname = usePathname();
  const current = routeMeta[pathname] ?? routeMeta["/"];

  return (
    <header className="topbar">
      <div className="topbar-context">
        <span className="topbar-mark" aria-hidden="true">
          <svg
            className="topbar-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={current.iconPath} />
          </svg>
        </span>
        <span className="topbar-crumb">A.D.A.P.T.</span>
        <span className="crumb-slash">/</span>
        <span className="topbar-section">{current.title}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <DatasetSelector />
        <div className="topbar-meta hidden sm:flex">
          <span className="meta-mark" />
          <span>INR</span>
          <span className="meta-separator" />
          <span>Simulated</span>
        </div>
      </div>
    </header>
  );
}
