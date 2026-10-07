"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>
      </svg>
    ),
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5M16 4v5M8 14h3M8 17h8"/>
      </svg>
    ),
  },
  {
    href: "/recommendations",
    label: "Recommendations",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z"/><path d="m4 12 8 4.3 8-4.3M4 16.5l8 4 8-4"/>
      </svg>
    ),
  },
  {
    href: "/learning",
    label: "Learning",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M9 7h6M9 11h6"/>
      </svg>
    ),
  },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around h-16 border-t border-[var(--line-strong)] bg-[#090c11]/95 backdrop-blur-md px-2" aria-label="Mobile navigation">
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[10px] font-medium transition-colors ${
              active ? "text-[var(--orange-soft)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
