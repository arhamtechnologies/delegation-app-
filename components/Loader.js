'use client';

import { Wave } from 'loading-dev';
import { BrandBadge } from './BrandLogo';

export function Loader({ label = 'Loading...', size = 48, fullScreen = false }) {
  return <div className={`app-loader${fullScreen ? ' app-loader-full' : ''}`} role="status" aria-live="polite">
    {fullScreen && <BrandBadge className="mb-1 size-12 rounded-xl" markClassName="w-7" />}
    <Wave size={size} color="var(--brand)" />
    <span>{label}</span>
  </div>;
}
