'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { BrandBadge } from './BrandLogo';
import { Button } from '@/components/ui/button';

const dismissKey = 'install-app-dismissed-at';
const dismissForMs = 14 * 24 * 60 * 60 * 1000;

function recentlyDismissed() {
  try {
    return Date.now() - Number(localStorage.getItem(dismissKey) || 0) < dismissForMs;
  } catch {
    return false;
  }
}

function detectPlatform() {
  const ua = navigator.userAgent;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // iPadOS reports itself as a Mac; touch support gives it away.
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const phone = window.matchMedia('(pointer: coarse)').matches;
  return { standalone, ios, iosChrome: ios && /CriOS/i.test(ua), phone };
}

// Phones only: Android Chrome gets the browser's own install dialog; iPhone browsers have
// no install API, so they get the Add to Home Screen steps. Hidden once installed or dismissed.
export default function InstallApp() {
  const [installEvent, setInstallEvent] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((error) => console.error('Service worker registration failed.', error?.message));
    }
    setPlatform(detectPlatform());
    setHidden(recentlyDismissed());
    // The layout's early script may have caught the event before this mounted.
    if (window.__installPromptEvent) setInstallEvent(window.__installPromptEvent);
    const capture = (event) => { event.preventDefault(); window.__installPromptEvent = event; setInstallEvent(event); };
    const installed = () => { window.__installPromptEvent = null; setInstallEvent(null); setHidden(true); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try { localStorage.setItem(dismissKey, String(Date.now())); } catch { /* private mode: hide for this visit only */ }
  }

  async function install() {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice.catch(() => ({ outcome: 'dismissed' }));
    window.__installPromptEvent = null;
    setInstallEvent(null);
    if (outcome !== 'accepted') dismiss();
  }

  if (hidden || !platform || platform.standalone || !platform.phone) return null;
  const iosSteps = platform.ios && !installEvent;
  if (!installEvent && !iosSteps) return null;

  return <div role="dialog" aria-label="Install the Delegation app" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-background p-3.5 shadow-lg">
    <BrandBadge className="size-10" markClassName="w-5.5" />
    <div className="min-w-0 flex-1">
      <p className="text-[15px] font-semibold text-foreground">Install Delegation</p>
      {iosSteps
        ? <p className="mt-0.5 text-[13.5px] leading-snug text-muted-foreground">Tap <Icon name="upload" size={14} className="inline-block align-[-2px] text-brand" /> Share {platform.iosChrome ? 'in the address bar' : 'at the bottom of Safari'}, then <span className="font-medium text-foreground">Add to Home Screen</span>.</p>
        : <p className="mt-0.5 text-[13.5px] leading-snug text-muted-foreground">Open it from your home screen like any app.</p>}
      {!iosSteps && <Button size="sm" className="mt-2.5 h-9 px-4 text-[14px]" onClick={install}><Icon name="download" size={15} />Install app</Button>}
    </div>
    <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 size-8 text-muted-foreground" aria-label="Dismiss" onClick={dismiss}><Icon name="close" size={16} /></Button>
  </div>;
}
