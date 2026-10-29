'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

// "g" then a letter jumps to a screen, like Linear.
export const goShortcuts = { d: '/dashboard', t: '/tasks', c: '/checklist', n: '/notifications', f: '/follow-up-tasks', m: '/mis', e: '/employees', l: '/calendar' };

function isTypingTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}


// Global keys: ⌘K / Ctrl+K or "/" opens the menu, "c" creates a task, "g" + letter navigates.
export function useWorkspaceShortcuts({ onOpenMenu, canCreate, allowedHrefs }) {
  const router = useRouter();
  const pendingG = useRef(0);
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); onOpenMenu(); return; }
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target) || document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (Date.now() - pendingG.current < 900 && goShortcuts[key]) {
        pendingG.current = 0;
        if (allowedHrefs.has(goShortcuts[key])) { event.preventDefault(); router.push(goShortcuts[key]); }
        return;
      }
      if (key === 'g') { pendingG.current = Date.now(); return; }
      if (key === '/') { event.preventDefault(); onOpenMenu(); return; }
      if (key === 'c' && canCreate) { event.preventDefault(); router.push('/tasks?create=1'); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowedHrefs, canCreate, onOpenMenu, router]);
}
