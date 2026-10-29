import { cn } from '@/lib/utils';

export const pageContainerClass = 'mx-auto w-full max-w-[1320px] px-3 pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-8';

// Page body inside the persistent AppFrame: compact Linear-style heading row, then the content.
export default function AppShell({ children, title, description, actions, className }) {
  return <div className={cn(pageContainerClass, className)}>
    <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-[14.5px] text-muted-foreground">{description}</p>}
      </div>
      {actions ? <div className="page-actions flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
    <div className="grid min-w-0 gap-4">{children}</div>
  </div>;
}
