"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { RoutePath } from "@/lib/presentation/manus-contracts";
import { Icon, type IconName } from "@/components/manus/ui/Icons";
import { BrandLogo } from "@/components/manus/ui/BrandLogo";

const navigation: Array<{ href: RoutePath; label: string; icon: IconName }> = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/recommendations", label: "Recommendations", icon: "recommendations" },
  { href: "/learning", label: "Learning", icon: "learning" },
];

const routeTitles: Record<RoutePath, string> = {
  "/": "Overview",
  "/campaigns": "Campaigns",
  "/recommendations": "Recommendations",
  "/learning": "Learning",
};

function NavItems({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname() as RoutePath;
  return <>{navigation.map((item, index) => {
    const active = pathname === item.href;
    return <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} className={`nav-item${active ? " is-active" : ""}${mobile ? " nav-item-mobile" : ""}`} aria-current={active ? "page" : undefined}>
      <span className="nav-item-icon"><Icon name={item.icon} /></span>
      <span className="nav-item-label">{item.label}</span>
      {!mobile && <span className="nav-item-index">0{index + 1}</span>}
    </Link>;
  })}</>;
}

export function WorkspaceShell({ children, headerActions }: { children: ReactNode; headerActions?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = (usePathname() || "/") as RoutePath;
  const pageTitle = routeTitles[pathname] ?? "Overview";
  return <div className={`workspace-shell${collapsed ? ' rail-collapsed' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside id="desktop-navigation" className="desktop-rail" aria-label="Primary navigation">
      <Link href="/" className="brand-lockup" aria-label="A.D.A.P.T. Overview">
        <BrandLogo className="brand-expanded" />
        <BrandLogo compact className="brand-compact" />
      </Link>
      <button className="rail-toggle" onClick={()=>setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-controls="desktop-navigation" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? '›' : '‹'}<span className="rail-toggle-label">Collapse sidebar</span></button>
      <div className="rail-divider" />
      <p className="rail-label">WORKSPACE</p>
      <nav className="rail-nav"><NavItems /></nav>
      <div className="rail-bottom">
        <div className="rail-manifest"><span className="manifest-glyph">Δ</span><p>High ROAS ≠<br /><strong>automatically scale.</strong></p></div>
        <div className="rail-footer"><span className="status-spark" /> A.D.A.P.T. <span className="footer-version">/ Simulated</span></div>
      </div>
    </aside>
    <div className="workspace-main">
      <header className="topbar">
        <div className="topbar-location"><span className="topbar-mark"><BrandLogo compact /></span><span className="topbar-brand">A.D.A.P.T.</span><span className="breadcrumb-slash">/</span><span className="topbar-page">{pageTitle}</span></div>
        <div className="topbar-actions">{headerActions ?? <span className="preview-label"><span />Standalone preview · source fixtures</span>}</div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
      <footer className="workspace-footer"><span>Advertising Decision Automation for Profitable Targeting</span><span>Prototype · no live execution</span></footer>
    </div>
    <nav className="mobile-rail" aria-label="Primary navigation"><NavItems mobile /></nav>
    <div id="app-announcer" className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
  </div>;
}
