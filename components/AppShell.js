'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase-browser';
import { getCurrentEmployee } from '../lib/auth';
import { getUnreadNotificationCount } from '../lib/notifications';
import { Icon } from './Icons';

const managerNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid', section: 'Workspace' },
  { href: '/tasks', label: 'Tasks', icon: 'clipboard', section: 'Workspace' },
  { href: '/checklist', label: 'Checklist', icon: 'checkSquare', section: 'Workspace' },
  { href: '/employees', label: 'Employees', icon: 'users', section: 'Manage' },
  { href: '/mis', label: 'MIS', icon: 'chart', section: 'Manage' },
];

const doerNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid', section: 'Workspace' },
  { href: '/tasks', label: 'My Tasks', icon: 'clipboard', section: 'Workspace' },
  { href: '/checklist', label: 'Checklist', icon: 'checkSquare', section: 'Workspace' },
];

function NotificationBell({ unreadCount, mobile = false }) {
  return <Link className={`notification-bell${mobile ? ' notification-bell-mobile' : ''}`} href="/notifications" aria-label="Notifications">
    <Icon name="bell" size={mobile ? 19 : 18} />
    {unreadCount > 0 && <span className="notification-dot" aria-hidden="true" />}
  </Link>;
}

export default function AppShell({ children, title, eyebrow = 'Workspace', description, actions }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [authState, setAuthState] = useState('checking');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const redirectingToLogin = useRef(false);

  useEffect(() => {
    let active = true;
    const supabase = supabaseBrowser();
    let profileRequest = null;

    async function loadProfile() {
      if (profileRequest) return profileRequest;
      profileRequest = (async () => {
        const { user, employee, error: authError } = await getCurrentEmployee();
        if (!user) {
          if (authError && authError.message !== 'Auth session missing!') console.error('Unable to verify the current session.', { code: authError.code, message: authError.message });
          if (active) {
            setAuthState('signed_out');
          }
          return;
        }

        if (!employee) {
          if (active) {
            setProfile(null);
            setAuthState('signed_out');
          }
          return;
        }

        const { count, error: notificationError } = await getUnreadNotificationCount(employee.id);
        if (notificationError) console.error('Unable to load unread notification count.', { code: notificationError.code, message: notificationError.message });

        if (employee.must_change_password) {
          if (active) {
            setProfile(employee);
            setAuthState('password_change_required');
            router.replace('/change-password');
          }
          return;
        }

        if (active) {
          setProfile(employee);
          setUnreadCount(count || 0);
          setAuthState('authenticated');
        }
      })().finally(() => {
        profileRequest = null;
      });
      return profileRequest;
    }

    loadProfile();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setUnreadCount(0);
        setAuthState('signed_out');
      }
      if (event === 'SIGNED_IN') loadProfile();
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'PASSWORD_RECOVERY') return;
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (authState !== 'authenticated' || !profile?.id) return undefined;
    let active = true;
    const supabase = supabaseBrowser();

    async function refreshUnreadCount() {
      const { count, error } = await getUnreadNotificationCount(profile.id);
      if (error) console.error('Unable to refresh unread notification count.', { code: error.code, message: error.message });
      else if (active) setUnreadCount(count || 0);
    }

    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_employee_id=eq.${profile.id}` }, () => {
        if (!active) return;
        setUnreadCount((current) => current + 1);
        window.dispatchEvent(new Event('notifications:changed'));
      })
      .subscribe();
    const pollingTimer = window.setInterval(refreshUnreadCount, 30000);
    window.addEventListener('notifications:changed', refreshUnreadCount);
    return () => {
      active = false;
      window.clearInterval(pollingTimer);
      window.removeEventListener('notifications:changed', refreshUnreadCount);
      supabase.removeChannel(channel);
    };
  }, [authState, profile?.id]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (authState !== 'signed_out' || pathname === '/login' || redirectingToLogin.current) return;
    redirectingToLogin.current = true;
    router.replace('/login');
  }, [authState, pathname, router]);

  useEffect(() => {
    const manager = ['super_admin', 'assigner', 'ea'].includes(profile?.role);
    const managerRoute = pathname === '/employees' || pathname.startsWith('/employees/') || pathname === '/mis' || pathname.startsWith('/mis/');
    if (authState === 'authenticated' && profile && !manager && managerRoute) router.replace('/tasks');
  }, [authState, pathname, profile, router]);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    const { error } = await supabaseBrowser().auth.signOut();
    if (error) {
      console.error('Unable to sign out.', { code: error.code, message: error.message });
      setSignOutError('Sign out failed. Please try again.');
      setSigningOut(false);
      return;
    }
    setProfile(null);
    setUnreadCount(0);
    setAuthState('signed_out');
  }

  if (authState === 'checking') return <div className="auth-loading-shell" role="status">Checking your session...</div>;
  if (authState === 'password_change_required') return <div className="auth-loading-shell" role="status">Your password needs to be updated...</div>;
  if (authState === 'signed_out') return <div className="auth-loading-shell" role="status">Signing you out...</div>;

  const isManager = ['super_admin', 'assigner', 'ea'].includes(profile?.role);
  const managerRoute = pathname === '/employees' || pathname.startsWith('/employees/') || pathname === '/mis' || pathname.startsWith('/mis/');
  if (managerRoute && !isManager) return <div className="auth-loading-shell" role="status">Redirecting to your tasks...</div>;
  const visibleItems = isManager ? managerNavItems : doerNavItems;
  const sections = [...new Set(visibleItems.map((item) => item.section))];

  return <div className="app-shell">
    <aside className={`sidebar${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
      <div className="sidebar-brand"><span className="brand-mark"><Icon name="sparkles" size={18} /></span><span>Delegation</span><button className="sidebar-close" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button></div>
      <div className="workspace-switcher"><span className="workspace-dot" /><span><strong>Arham workspace</strong><small>Accountability hub</small></span><Icon name="chevronDown" size={14} /></div>
      <nav className="sidebar-nav" id="primary-navigation">
        {sections.map((section) => <div className="nav-section" key={section}><div className="nav-section-label">{section}</div>{visibleItems.filter((item) => item.section === section).map((item) => <Link className={`nav-link${pathname === item.href || pathname.startsWith(`${item.href}/`) ? ' active' : ''}`} key={item.href} href={item.href} onClick={() => setMenuOpen(false)}><Icon name={item.icon} size={18} /><span>{item.label}</span></Link>)}</div>)}
      </nav>
      <div className="sidebar-footer"><div className="user-menu"><span><strong>{profile?.name || 'Workspace user'}</strong><small>{profile?.role ? profile.role.replace('_', ' ') : 'Workspace member'}</small></span></div>{signOutError && <div className="sidebar-error" role="alert"><Icon name="warning" size={14} />{signOutError}</div>}<button className="signout-button" type="button" onClick={logout} disabled={signingOut}><Icon name="logout" size={16} />{signingOut ? 'Signing out...' : 'Sign out'}</button></div>
    </aside>
    {menuOpen && <button className="nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="main-content">
      <header className="mobile-topbar"><button className="menu-toggle" type="button" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><div className="mobile-brand"><span className="brand-mark"><Icon name="sparkles" size={15} /></span>Delegation</div><NotificationBell unreadCount={unreadCount} mobile /></header>
      <div className="page-container"><div className="page-header"><div className="page-heading"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="page-header-tools"><NotificationBell unreadCount={unreadCount} />{actions ? <div className="page-actions">{actions}</div> : null}</div></div>{children}</div>
    </main>
  </div>;
}
