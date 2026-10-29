'use client';

import { usePathname } from 'next/navigation';
import { Loader } from '../components/Loader';
import { publicRoutes } from '../components/AppFrame';
import { pageContainerClass } from '../components/AppShell';
import { ListSkeleton, Surface } from '../components/Workflow';

// Route-transition fallback. Inside the workspace it fills only the content area, so the sidebar and header stay put.
export default function Loading() {
  const pathname = usePathname();
  if (publicRoutes.has(pathname)) return <Loader fullScreen />;
  return <div className={pageContainerClass} aria-busy="true" aria-label="Loading">
    <Surface><ListSkeleton rows={8} /></Surface>
  </div>;
}
