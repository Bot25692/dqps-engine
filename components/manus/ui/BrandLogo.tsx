import Image from 'next/image';

/** Optimized derivatives of the supplied official artwork; no generated replacement. */
export function BrandLogo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return <Image src={compact ? '/brand/adapt-emblem.webp' : '/brand/adapt-logo.webp'}
    alt="A.D.A.P.T." width={compact ? 128 : 320} height={compact ? 128 : 320}
    className={`official-logo ${className}`} unoptimized loading="eager" />;
}
