import { Geist } from 'next/font/google';
import Script from 'next/script';
import { TooltipProvider } from '@/components/ui/tooltip';
import AppFrame from '../components/AppFrame';
import InstallApp from '../components/InstallApp';
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

// Chrome can offer installation before React loads; keep that event for components/InstallApp.js.
const installPromptCapture = "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPromptEvent=e;});";

export default async function RootLayout({ children }) {
  const [session, sidebarOpen] = await Promise.all([getServerSession(), getSidebarDefaultOpen()]);
  return <html lang="en" className={`${geist.variable} ${geist.className}`}><body><Script id="install-prompt-capture" strategy="beforeInteractive">{installPromptCapture}</Script><TooltipProvider delayDuration={200}><AppFrame initialProfile={session?.employee || null} initialUserId={session?.userId || null} initialUnreadCount={session?.unreadCount || 0} sidebarOpen={sidebarOpen}>{children}</AppFrame><InstallApp /></TooltipProvider></body></html>;
}
