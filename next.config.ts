import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: { rules: { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } } },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
