import { Geist } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const geist = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist' });

export const metadata = {
  title: { default: 'Delegation', template: '%s · Delegation' },
  description: 'Task delegation and follow-up',
  applicationName: 'Delegation',
  appleWebApp: { capable: true, title: 'Delegation', statusBarStyle: 'default' },
  openGraph: { title: 'Delegation', description: 'Task delegation and follow-up', images: ['/brand/delegation-logo.jpg'] },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return <html lang="en" className={`${geist.variable} ${geist.className}`}><body><TooltipProvider delayDuration={200}>{children}</TooltipProvider></body></html>;
}
