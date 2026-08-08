'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase-browser';
import { Avatar } from './UI';
import { Icon } from './Icons';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: 'grid', section: 'Workspace' },
  { href: '/tasks', label: 'My tasks', icon: 'clipboard', section: 'Workspace' },
  { href: '/employees', label: 'People', icon: 'users', section: 'Manage', managerOnly: true },
  { href: '/mis', label: 'MIS reports', icon: 'chart', section: 'Manage', managerOnly: true },
  { href: '/notifications', label: 'Notifications', icon: 'bell', section: 'Workspace', notification: true },
  { href: '/settings', label: 'Settings', icon: 'settings', section: 'Manage' },
];

export default function AppShell({ children, title, eyebrow = 'Workspace', description, actions }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } = {} } = await supabaseBrowser().auth.getUser();
      if (!user) return;
      const { data } = await supabaseBrowser().from('employees').select('id,name,email,role,department_id,active').eq('auth_user_id', user.id).maybeSingle();
      if (active) setProfile(data || { name: user.email?.split('@')[0] || 'Workspace user', email: user.email, role: 'super_admin' });
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const isManager = !profile || ['super_admin', 'assigner', 'ea'].includes(profile.role);
  const visibleItems = navItems.filter((item) => !item.managerOnly || isManager);
  const sections = [...new Set(visibleItems.map((item) => item.section))];

  return <div className="app-shell">
    <aside className={`sidebar${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
      <div className="sidebar-brand"><span className="brand-mark"><Icon name="sparkles" size={18} /></span><span>Delegation</span><button className="sidebar-close" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button></div>
      <div className="workspace-switcher"><span className="workspace-dot" /><span><strong>Arham workspace</strong><small>Accountability hub</small></span><Icon name="chevronDown" size={14} /></div>
      <nav className="sidebar-nav" id="primary-navigation">
        {sections.map((section) => <div className="nav-section" key={section}><div className="nav-section-label">{section}</div>{visibleItems.filter((item) => item.section === section).map((item) => <Link className={`nav-link${pathname === item.href || pathname.startsWith(`${item.href}/`) ? ' active' : ''}`} key={item.href} href={item.href} onClick={() => setMenuOpen(false)}><Icon name={item.icon} size={18} /><span>{item.label}</span>{item.notification && <span className="nav-count">3</span>}</Link>)}</div>)}
      </nav>
      <div className="sidebar-footer"><div className="sidebar-help"><span className="help-icon"><Icon name="message" size={16} /></span><div><strong>Need a hand?</strong><small>Open the help center</small></div><Icon name="arrowUpRight" size={14} /></div><button className="user-menu" type="button" onClick={() => router.push('/settings')}><Avatar name={profile?.name || 'Workspace user'} size="sm" /><span><strong>{profile?.name || 'Workspace user'}</strong><small>{profile?.role ? profile.role.replace('_', ' ') : 'Loading profile'}</small></span><Icon name="more" size={16} /></button></div>
    </aside>
    {menuOpen && <button className="nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="main-content">
      <header className="mobile-topbar"><button className="menu-toggle" type="button" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><div className="mobile-brand"><span className="brand-mark"><Icon name="sparkles" size={15} /></span>Delegation</div><Link className="mobile-bell" href="/notifications"><Icon name="bell" size={19} /><span>3</span></Link></header>
      <div className="page-container"><div className="page-header"><div className="page-heading"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>{children}</div>
    </main>
  </div>;
}
