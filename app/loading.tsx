import { BrandLogo } from '@/components/manus/ui/BrandLogo';

// Native streaming fallback: lightweight branding, no artificial splash delay.
export default function Loading(){return <section className="loading-surface branded-loading" role="status" aria-label="Loading selected dataset"><BrandLogo /><p>Loading decision workspace…</p><div className="loading-bar"/><div className="loading-grid" aria-hidden="true"><span/><span/><span/><span/></div></section>;}
