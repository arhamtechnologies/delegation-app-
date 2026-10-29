'use client';

import { Dual } from 'loading-dev';
import { BrandBadge } from './BrandLogo';
import { cn } from '@/lib/utils';

// The one loading animation used across the app, so every wait looks the same.
export function Loader({ label = 'Loading...', size = 48, fullScreen = false }) {
  return <div className={`app-loader${fullScreen ? ' app-loader-full' : ''}`} role="status" aria-live="polite">
    {fullScreen && <BrandBadge className="mb-1 size-12 rounded-xl" markClassName="w-7" />}
    <Dual size={size} color="var(--brand)" />
    <span>{label}</span>
  </div>;
}

// Inline version for buttons and toolbars while a request is in flight; takes the text colour around it.
export function Spinner({ size = 14, className }) {
  return <Dual size={size} color="currentColor" className={cn('inline-block shrink-0 align-middle', className)} />;
}
