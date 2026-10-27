'use client';

import { Wave } from 'loading-dev';

export function Loader({ label = 'Loading...', size = 48, fullScreen = false }) {
  return <div className={`app-loader${fullScreen ? ' app-loader-full' : ''}`} role="status" aria-live="polite">
    <Wave size={size} color="var(--purple)" />
    <span>{label}</span>
  </div>;
}
