'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase-browser';
import { clearAuthCache, getCurrentEmployee, peekCurrentEmployee, syncAuthSession } from '../lib/auth';
import { getUnreadNotificationCount } from '../lib/notifications';
import { Icon } from './Icons';
import { Loader } from './Loader';
import { BrandBadge, BrandLogo } from './BrandLogo';
import { Avatar } from './UI';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

const managerNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid', section: 'Workspace' },
  { href: '/tasks', label: 'Tasks', icon: 'clipboard', section: 'Workspace' },
  { href: '/checklist', label: 'Checklist', icon: 'checkSquare', section: 'Workspace' },
  { href: '/notifications', label: 'Notifications', icon: 'bell', section: 'Workspace' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar', section: 'Manage', roles: ['super_admin', 'ea'] },
  { href: '/employees', label: 'Employees', icon: 'users', section: 'Manage' },
  { href: '/mis', label: 'MIS', icon: 'chart', section: 'Manage' },
];

const doerNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid', section: 'Workspace' },
  { href: '/tasks', label: 'My Tasks', icon: 'clipboard', section: 'Workspace' },
  { href: '/checklist', label: 'Checklist', icon: 'checkSquare', section: 'Workspace' },
  { href: '/notifications', label: 'Notifications', icon: 'bell', section: 'Workspace' },
];

// AppShell remounts on every page; reuse the last verified profile so navigation skips the session screen.
function getCachedProfile() {
  const employee = peekCurrentEmployee()?.employee;
  return employee?.active !== false && !employee?.must_change_password ? employee || null : null;
}

// Each page mounts its own AppShell, so restore the desktop sidebar's collapsed state from the cookie shadcn writes.
function readSidebarOpen() {
  if (typeof document === 'undefined') return true;
  return !document.cookie.split('; ').includes('sidebar_state=false');
}

function NotificationBell({ unreadCount }) {
  return <Button asChild variant="ghost" size="icon" className="relative size-10 text-muted-foreground hover:text-brand">
    <Link href="/notifications" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
      <Icon name="bell" size={19} />
      {unreadCount > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive ring-2 ring-background" aria-hidden="true" />}
    </Link>
  </Button>;
}

function isActivePath(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Closes the mobile drawer after navigation; must live inside SidebarProvider.
function CloseMobileSidebarOnNavigate({ pathname }) {
  const { setOpenMobile } = useSidebar();
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);
  return null;
}

function AppSidebar({ pathname, items, sections, unreadCount, profile, signingOut, signOutError, onSignOut }) {
  const roleLabel = profile?.role ? profile.role.replace('_', ' ') : 'Workspace member';
  return <Sidebar collapsible="icon" aria-label="Primary navigation">
    <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild size="lg" tooltip="Dashboard" className="hover:bg-transparent active:bg-transparent group-data-[collapsible=icon]:p-0!">
            <Link href="/dashboard" aria-label="Go to Dashboard"><BrandLogo subtitle="Arham workspace" /></Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent id="primary-navigation" className="py-2">
      {sections.map((section) => <SidebarGroup key={section}>
        <SidebarGroupLabel className="text-[11px] font-semibold tracking-[.08em] text-muted-foreground/80 uppercase">{section}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.filter((item) => item.section === section).map((item) => <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActivePath(pathname, item.href)} tooltip={item.label} className="h-10 text-[14px] font-medium data-[active=true]:font-semibold data-[active=true]:text-brand [&>svg]:size-[18px]">
                <Link href={item.href}><Icon name={item.icon} size={18} /><span>{item.label}</span></Link>
              </SidebarMenuButton>
              {item.href === '/notifications' && unreadCount > 0 && <SidebarMenuBadge className="top-2.5 rounded-full bg-brand px-1.5 text-[11px] text-white peer-hover/menu-button:text-white peer-data-[active=true]/menu-button:text-white">{unreadCount > 99 ? '99+' : unreadCount}</SidebarMenuBadge>}
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>)}
    </SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border p-3">
      {signOutError && <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive group-data-[collapsible=icon]:hidden" role="alert"><Icon name="warning" size={14} />{signOutError}</div>}
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" tooltip={profile?.name || 'Account'} className="data-[state=open]:bg-sidebar-accent">
                <Avatar name={profile?.name || 'User'} size="sm" />
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-[13px] font-semibold text-foreground">{profile?.name || 'Workspace user'}</span>
                  <span className="truncate text-xs text-muted-foreground capitalize">{roleLabel}</span>
                </span>
                <Icon name="chevronDown" size={15} />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-foreground">{profile?.name || 'Workspace user'}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{profile?.email || roleLabel}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/notifications"><Icon name="bell" size={16} />Notifications</Link></DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={signingOut} onSelect={onSignOut}><Icon name="logout" size={16} />{signingOut ? 'Signing out...' : 'Sign out'}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}

export default function AppShell({ children, title, eyebrow = 'Workspace', description, actions }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState(getCachedProfile);
  const [unreadCount, setUnreadCount] = useState(0);
  const [authState, setAuthState] = useState(() => (getCachedProfile() ? 'authenticated' : 'checking'));
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
          setAuthState('authenticated');
        }
        // Load the badge count after the shell is visible instead of blocking it.
        getUnreadNotificationCount(employee.id).then(({ count, error: notificationError }) => {
          if (notificationError) console.error('Unable to load unread notification count.', { code: notificationError.code, message: notificationError.message });
          else if (active) setUnreadCount(count || 0);
        });
      })().finally(() => {
        profileRequest = null;
      });
      return profileRequest;
    }

    loadProfile();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') clearAuthCache();
      else if (session) syncAuthSession(session);
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
      if (document.visibilityState !== 'visible') return;
      const { count, error } = await getUnreadNotificationCount(profile.id, { force: true });
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
    document.addEventListener('visibilitychange', refreshUnreadCount);
    return () => {
      active = false;
      window.clearInterval(pollingTimer);
      window.removeEventListener('notifications:changed', refreshUnreadCount);
      document.removeEventListener('visibilitychange', refreshUnreadCount);
      supabase.removeChannel(channel);
    };
  }, [authState, profile?.id]);

  useEffect(() => {
    if (authState !== 'signed_out' || pathname === '/login' || redirectingToLogin.current) return;
    redirectingToLogin.current = true;
    router.replace('/login');
  }, [authState, pathname, router]);

  useEffect(() => {
    const manager = ['super_admin', 'assigner', 'ea'].includes(profile?.role);
    const managerRoute = pathname === '/employees' || pathname.startsWith('/employees/') || pathname === '/mis' || pathname.startsWith('/mis/') || pathname === '/calendar' || pathname.startsWith('/calendar/');
    const calendarRoute = pathname === '/calendar' || pathname.startsWith('/calendar/');
    const canManageCalendar = ['super_admin', 'ea'].includes(profile?.role);
    if (authState === 'authenticated' && profile && ((!manager && managerRoute) || (calendarRoute && !canManageCalendar))) router.replace(calendarRoute ? '/checklist' : '/tasks');
  }, [authState, pathname, profile, router]);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      const { error } = await supabaseBrowser().auth.signOut({ scope: 'local' });
      if (error) throw error;

      clearAuthCache();
      setProfile(null);
      setUnreadCount(0);
      setAuthState('signed_out');
      router.replace('/login');
      router.refresh();
    } catch (error) {
      console.error('Unable to sign out.', { code: error.code, message: error.message });
      setSignOutError('Sign out failed. Please try again.');
      setSigningOut(false);
    }
  }

  if (authState === 'checking') return <Loader fullScreen label="Checking your session..." />;
  if (authState === 'password_change_required') return <Loader fullScreen label="Your password needs to be updated..." />;
  if (authState === 'signed_out') return <Loader fullScreen label="Signing you out..." />;

  const isManager = ['super_admin', 'assigner', 'ea'].includes(profile?.role);
  const managerRoute = pathname === '/employees' || pathname.startsWith('/employees/') || pathname === '/mis' || pathname.startsWith('/mis/') || pathname === '/calendar' || pathname.startsWith('/calendar/');
  const calendarRoute = pathname === '/calendar' || pathname.startsWith('/calendar/');
  const canManageCalendar = ['super_admin', 'ea'].includes(profile?.role);
  if (managerRoute && !isManager) return <Loader fullScreen label="Redirecting to your tasks..." />;
  if (calendarRoute && !canManageCalendar) return <Loader fullScreen label="Redirecting to your checklist..." />;
  const visibleItems = (isManager ? managerNavItems : doerNavItems).filter((item) => !item.roles || item.roles.includes(profile?.role));
  const sections = [...new Set(visibleItems.map((item) => item.section))];

  return <SidebarProvider defaultOpen={readSidebarOpen()}>
    <CloseMobileSidebarOnNavigate pathname={pathname} />
    <AppSidebar pathname={pathname} items={visibleItems} sections={sections} unreadCount={unreadCount} profile={profile} signingOut={signingOut} signOutError={signOutError} onSignOut={logout} />
    <SidebarInset className="min-w-0 bg-canvas">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-md supports-backdrop-filter:bg-background/75 sm:px-4 md:h-16 md:px-6">
        <SidebarTrigger className="size-10 text-muted-foreground" aria-label="Toggle navigation" />
        <Link className="flex min-w-0 items-center gap-2 md:hidden" href="/dashboard" aria-label="Go to Dashboard"><BrandBadge className="size-8" markClassName="w-[18px]" /><span className="truncate text-[15px] font-semibold tracking-tight">Delegation</span></Link>
        <nav className="ml-1 hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground md:flex" aria-label="Breadcrumb">
          {eyebrow.split('/').map((part, index, parts) => <span key={`${part}-${index}`} className="flex min-w-0 items-center gap-1.5">{index > 0 && <Icon name="chevronRight" size={14} />}<span className={index === parts.length - 1 ? 'truncate font-medium text-foreground' : 'truncate'}>{part.trim()}</span></span>)}
        </nav>
        <div className="ml-auto flex items-center gap-1"><NotificationBell unreadCount={unreadCount} /></div>
      </header>
      <div className="page-container">
        <div className="page-header">
          <div className="page-heading"><h1>{title}</h1>{description && <p>{description}</p>}</div>
          {actions ? <div className="page-actions">{actions}</div> : null}
        </div>
        {children}
      </div>
    </SidebarInset>
  </SidebarProvider>;
}
