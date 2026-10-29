import { BrandLogo } from './BrandLogo';
import { Icon } from './Icons';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Shared frame for sign-in and password screens: logo, one focused card, quiet footer.
export function AuthLayout({ title, description, eyebrow, children, footer }) {
  return <main className="relative flex min-h-dvh flex-col items-center bg-canvas px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 sm:justify-center sm:py-12">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-brand-soft/80 to-transparent" />
    <div className="relative flex w-full max-w-[420px] flex-col gap-6">
      <BrandLogo className="self-center" subtitle="Task delegation & follow-up" />
      <Card className="gap-6 py-7 shadow-sm ring-border sm:py-8">
        <CardHeader className="gap-1.5 px-6 sm:px-8">
          {eyebrow && <span className="text-[12px] font-semibold tracking-[.08em] text-brand uppercase">{eyebrow}</span>}
          <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
          {description && <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>}
        </CardHeader>
        <CardContent className="px-6 sm:px-8">{children}</CardContent>
      </Card>
      {footer && <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  </main>;
}

export function AuthMessage({ tone = 'error', className, children }) {
  return <Alert variant={tone === 'error' ? 'destructive' : 'default'} className={cn('px-3 py-2.5', className, tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-destructive/25 bg-destructive/5')} role={tone === 'error' ? 'alert' : 'status'}>
    <Icon name={tone === 'error' ? 'warning' : 'checkCircle'} size={16} />
    <AlertDescription className={cn(tone === 'success' && 'text-emerald-800')}>{children}</AlertDescription>
  </Alert>;
}

export function AuthNote() {
  return <span className="inline-flex items-center gap-1.5 text-xs"><Icon name="shield" size={14} />Your password is protected by Supabase Auth.</span>;
}
