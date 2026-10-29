import { Geist } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import AppFrame from '../components/AppFrame';
import { getServerSession, getSidebarDefaultOpen } from '../lib/server-session';
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

export default async function RootLayout({ children }) {
  const [session, sidebarOpen] = await Promise.all([getServerSession(), getSidebarDefaultOpen()]);
  return <html lang="en" className={`${geist.variable} ${geist.className}`}><body><TooltipProvider delayDuration={200}><AppFrame initialProfile={session?.employee || null} initialUserId={session?.userId || null} initialUnreadCount={session?.unreadCount || 0} sidebarOpen={sidebarOpen}>{children}</AppFrame></TooltipProvider></body></html>;
}
