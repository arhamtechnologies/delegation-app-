'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase-browser';
import { clearAuthCache, getCurrentEmployee, peekCurrentEmployee, primeCurrentEmployee, syncAuthSession } from '../lib/auth';
import { getUnreadNotificationCount } from '../lib/notifications';
import { Icon } from './Icons';
import { Loader, Spinner } from './Loader';
import { BrandBadge, BrandLogo } from './BrandLogo';
import { Avatar, roleLabel } from './UI';
import { useWorkspaceShortcuts } from './WorkspaceShortcuts';
import { Kbd } from './Workflow';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

const managerNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid', section: 'Workspace' },
  { href: '/tasks', label: 'Tasks', icon: 'clipboard', section: 'Workspace' },
  { href: '/checklist', label: 'Checklist', icon: 'checkSquare', section: 'Workspace' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar', section: 'Manage', roles: ['super_admin', 'ea'] },
  { href: '/employees', label: 'Employees', icon: 'users', section: 'Manage' },
  { href: '/mis', label: 'MIS', icon: 'chart', section: 'Manage' },
];

const doerNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid', section: 'Workspace' },
  { href: '/tasks', label: 'My Tasks', icon: 'clipboard', section: 'Workspace' },
  { href: '/checklist', label: 'Checklist', icon: 'checkSquare', section: 'Workspace' },
];

// Reuse the last verified profile so a full reload of a cached session skips the session screen.
function getCachedProfile() {
  const employee = peekCurrentEmployee()?.employee;
  return employee?.active !== false && !employee?.must_change_password ? employee || null : null;
}

function NotificationBell({ unreadCount }) {
  return <Button asChild variant="ghost" className="relative h-11 px-2.5 text-foreground hover:text-brand">
    <Link href="/notifications" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
      <Icon name="bell" size={32} className="size-8" />
      {unreadCount > 0 && <span className="absolute top-1.5 right-2 size-3 rounded-full bg-destructive ring-2 ring-background" aria-hidden="true" />}
    </Link>
  </Button>;
}

function isActivePath(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// cmdk and the command list load the first time the menu opens, not with every page.
const CommandMenu = dynamic(() => import('./CommandMenu').then((module) => module.CommandMenu), { ssr: false });

function WorkspaceShortcuts({ items, canCreate, onOpenMenu }) {
  // Follow-ups is open to every role but lives outside the sidebar.
  const allowedHrefs = useMemo(() => new Set([...items.map((item) => item.href), '/follow-up-tasks']), [items]);
  useWorkspaceShortcuts({ onOpenMenu, canCreate, allowedHrefs });
  return null;
}

// Closes the mobile drawer after navigation; must live inside SidebarProvider.
function CloseMobileSidebarOnNavigate({ pathname }) {
  const { setOpenMobile } = useSidebar();
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);
  return null;
}

function AppSidebar({ pathname, items, sections, unreadCount, profile, signingOut, signOutError, onSignOut, onOpenMenu, canCreate }) {
  const role = roleLabel(profile?.role);
  return <Sidebar variant="inset" collapsible="icon" aria-label="Primary navigation">
    <SidebarHeader className="gap-1 px-2 pt-2.5 pb-1">
      <div className="flex items-center gap-1">
        <SidebarMenu className="min-w-0 flex-1">
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Dashboard" className="h-10 px-1.5 group-data-[collapsible=icon]:p-0!">
              <Link href="/dashboard" aria-label="Go to Dashboard"><BrandLogo subtitle="Arham workspace" /></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {canCreate && <Button asChild variant="outline" size="icon-sm" className="size-8 shrink-0 bg-background shadow-xs group-data-[collapsible=icon]:hidden" title="Create task (C)">
          <Link href="/tasks?create=1" aria-label="Create task"><Icon name="edit" size={20} className="size-5" /></Link>
        </Button>}
      </div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Search (⌘K)" className="h-8 text-[14px] text-muted-foreground" onClick={onOpenMenu}>
            <Icon name="search" size={20} className="size-5" /><span>Search</span><Kbd className="ml-auto bg-background">⌘K</Kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent id="primary-navigation" className="gap-0 py-1">
      {sections.map((section) => <SidebarGroup key={section} className="py-1.5">
        <SidebarGroupLabel className="h-7 text-[13px] font-medium text-muted-foreground">{section}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-px">
            {items.filter((item) => item.section === section).map((item) => <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActivePath(pathname, item.href)} tooltip={item.label} className="h-10 text-[14.5px] font-medium text-sidebar-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-xs data-[active=true]:ring-1 data-[active=true]:ring-border [&>svg]:size-4 max-md:h-10 max-md:text-[16px]">
                <Link href={item.href}><Icon name={item.icon} size={22} className="size-[22px]" /><span>{item.label}</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>)}
    </SidebarContent>
    <SidebarFooter className="p-2">
      {signOutError && <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive group-data-[collapsible=icon]:hidden" role="alert"><Icon name="warning" size={14} />{signOutError}</div>}
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" tooltip={profile?.name || 'Account'} className="h-11 data-[state=open]:bg-sidebar-accent">
                <Avatar name={profile?.name || 'User'} size="sm" />
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-[14px] font-semibold text-foreground">{profile?.name || 'Workspace user'}</span>
                  <span className="truncate text-xs text-muted-foreground">{role}</span>
                </span>
                <Icon name="chevronDown" size={15} />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-foreground">{profile?.name || 'Workspace user'}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{profile?.email || role}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpenMenu}><Icon name="search" size={16} />Command menu<span className="ml-auto text-xs text-muted-foreground">⌘K</span></DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={signingOut} onSelect={onSignOut}><Icon name="logout" size={16} />{signingOut ? <><Spinner />Signing out...</> : 'Sign out'}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}

// Screens that render without the workspace chrome.
export const publicRoutes = new Set(['/', '/login', '/forgot-password', '/change-password', '/update-password']);

const extraCrumbs = { '/follow-up-tasks': ['Workspace', 'Follow-ups'] };

function getBreadcrumb(pathname) {
  if (extraCrumbs[pathname]) return extraCrumbs[pathname];
  const item = managerNavItems.find((navItem) => isActivePath(pathname, navItem.href));
  if (!item) return ['Workspace'];
  return pathname === item.href ? [item.section, item.label] : [item.section, item.label, 'Details'];
}

// Mounted once in the root layout so navigating between pages never tears down the sidebar and header.
export default function AppFrame({ children, initialProfile, initialUserId, initialUnreadCount, sidebarOpen }) {
  const pathname = usePathname();
  if (publicRoutes.has(pathname)) return children;
  return <WorkspaceFrame pathname={pathname} initialProfile={initialProfile} initialUserId={initialUserId} initialUnreadCount={initialUnreadCount} sidebarOpen={sidebarOpen}>{children}</WorkspaceFrame>;
}

function WorkspaceFrame({ children, pathname, initialProfile, initialUserId, initialUnreadCount = 0, sidebarOpen = true }) {
  const router = useRouter();
  // The server-rendered profile lets the first paint show the full workspace instead of a session check.
  const [profile, setProfile] = useState(() => getCachedProfile() || initialProfile || null);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [authState, setAuthState] = useState(() => (getCachedProfile() || initialProfile ? 'authenticated' : 'checking'));
  // Module state must only be touched in the browser (on the server it would be shared between requests), and only once per mount.
  useState(() => { if (typeof window !== 'undefined') primeCurrentEmployee(initialProfile, initialUserId); return null; });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRequested, setMenuRequested] = useState(false);
  const openMenu = useCallback(() => { setMenuRequested(true); setMenuOpen(true); }, []);
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
    window.addEventListener('notifications:changed', refreshUnreadCount);
    document.addEventListener('visibilitychange', refreshUnreadCount);
    return () => {
      active = false;
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

  // Managers delegate; everyone else adds tasks for themselves.
  const canCreate = Boolean(profile?.role);
  return <SidebarProvider defaultOpen={sidebarOpen}>
    <CloseMobileSidebarOnNavigate pathname={pathname} />
    <WorkspaceShortcuts items={visibleItems} canCreate={canCreate} onOpenMenu={openMenu} />
    {menuRequested && <CommandMenu open={menuOpen} onOpenChange={setMenuOpen} navItems={visibleItems} canCreate={canCreate} />}
    <AppSidebar pathname={pathname} items={visibleItems} sections={sections} unreadCount={unreadCount} profile={profile} signingOut={signingOut} signOutError={signOutError} onSignOut={logout} onOpenMenu={openMenu} canCreate={canCreate} />
    <SidebarInset className="min-w-0 md:border md:border-border/70">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-2.5 backdrop-blur-md supports-backdrop-filter:bg-background/75 sm:px-4 md:rounded-t-xl max-md:h-14">
        <SidebarTrigger className="size-9 text-muted-foreground" aria-label="Toggle navigation" />
        <Link className="flex min-w-0 items-center gap-2 md:hidden" href="/dashboard" aria-label="Go to Dashboard"><BrandBadge className="size-8" markClassName="w-[18px]" /><span className="truncate text-[16px] font-semibold tracking-tight">Delegation</span></Link>
        <nav className="ml-1 hidden min-w-0 items-center gap-1.5 text-[14px] text-muted-foreground md:flex" aria-label="Breadcrumb">
          {getBreadcrumb(pathname).map((part, index, parts) => <span key={`${part}-${index}`} className="flex min-w-0 items-center gap-1.5">{index > 0 && <Icon name="chevronRight" size={16} />}<span className={index === parts.length - 1 ? 'truncate font-medium text-foreground' : 'truncate'}>{part}</span></span>)}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-10 text-muted-foreground md:hidden" aria-label="Search" onClick={openMenu}><Icon name="search" size={24} className="size-6" /></Button>
          <NotificationBell unreadCount={unreadCount} />
        </div>
      </header>
      {children}
    </SidebarInset>
  </SidebarProvider>;
}
