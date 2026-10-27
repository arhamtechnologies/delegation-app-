import { cn } from '@/lib/utils';

// Vector trace of public/brand/delegation-logo.jpg so the mark stays crisp at every size.
const MARK_PATH = 'M26 0H266A126 126 0 0 1 266 252H79L105 193H266A67 67 0 0 0 266 59H0ZM66 96H267A29.5 29.5 0 0 1 267 155H39Z';

export function BrandMark({ className, title }) {
  return <svg className={cn('h-auto w-7 shrink-0 text-brand', className)} viewBox="0 0 392 252" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false"><path fill="currentColor" d={MARK_PATH} /></svg>;
}

// The mark sitting on the logo's soft field, sized for headers and app chrome.
export function BrandBadge({ className, markClassName }) {
  return <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft ring-1 ring-brand/10', className)}><BrandMark className={cn('w-5', markClassName)} /></span>;
}

export function BrandLogo({ className, subtitle }) {
  return <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
    <BrandBadge />
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">Delegation</span>
      {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
    </span>
  </span>;
}
