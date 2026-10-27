'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { Icon } from '../../components/Icons';
import { MetricCard } from '../../components/UI';
import { canCreateTasks, getCurrentEmployee, peekCurrentEmployee } from '../../lib/auth';
import { peekQuery, queryKey, setQuery } from '../../lib/query-cache';
import { getTaskEmployees } from '../../lib/task-data';
import { getUnifiedDashboardData } from '../../lib/work-data';

const DashboardTodayWork = dynamic(() => import('../../components/DashboardTodayWork'), {
  loading: () => <section className="panel overview-panel" aria-label="Loading today&apos;s tasks"><Loader label="Loading today&apos;s tasks..." /></section>,
});

function MetricSkeleton() {
  return <div className="metric-card metric-card-loading" aria-hidden="true"><div className="metric-card-top"><span className="metric-icon skeleton-shimmer" /></div><div className="metric-value"><span className="metric-value-placeholder skeleton-shimmer" /></div><div className="metric-label"><span className="metric-label-placeholder skeleton-shimmer" /></div></div>;
}

function IntroSkeleton() {
  return <section className="overview-intro overview-intro-loading" aria-label="Loading dashboard"><p><span className="overview-greeting-placeholder skeleton-shimmer" /></p><span className="overview-subtitle-placeholder skeleton-shimmer" /></section>;
}

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState(() => peekQuery(queryKey('dashboard', peekCurrentEmployee()?.employee?.id)) || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dashboardRequestId = useRef(0);
  const dashboardAbortRef = useRef(null);

  async function load() {
    dashboardAbortRef.current?.abort();
    const controller = new AbortController();
    dashboardAbortRef.current = controller;
    const requestId = dashboardRequestId.current + 1;
    dashboardRequestId.current = requestId;
    setLoading(true);
    setError('');
    try {
      const { user, employee, error: employeeError } = await getCurrentEmployee();
      if (controller.signal.aborted || dashboardRequestId.current !== requestId) return;
      if (!user) return;
      if (employeeError || !employee) throw employeeError || new Error('Unable to load your workspace profile. Please try again.');
      const employeeRequest = canCreateTasks(employee.role)
        ? getTaskEmployees()
        : Promise.resolve({ data: [employee], error: null });
      const [workResponse, employeeResponse] = await Promise.all([
        getUnifiedDashboardData({ signal: controller.signal }),
        employeeRequest,
      ]);
      if (controller.signal.aborted || dashboardRequestId.current !== requestId) return;
      if (workResponse.error) throw workResponse.error;
      if (employeeResponse.error) throw employeeResponse.error;
      const nextData = {
        name: employee.name,
        role: employee.role,
        employees: employeeResponse.data || [],
        metrics: workResponse.data?.metrics || {},
        todayTasks: workResponse.data?.todayItems || [],
      };
      setQuery(queryKey('dashboard', employee.id), nextData);
      setDashboardData(nextData);
    } catch (loadError) {
      if (!controller.signal.aborted && dashboardRequestId.current === requestId) {
        console.error('[dashboard] load failed', { message: loadError?.message || 'Unknown dashboard loading error' });
        setError(loadError?.message || 'Unable to load dashboard data. Please try again.');
      }
    } finally {
      if (!controller.signal.aborted && dashboardRequestId.current === requestId) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => dashboardAbortRef.current?.abort();
  }, []);

  const manager = Boolean(dashboardData && ['super_admin', 'assigner', 'ea'].includes(dashboardData.role));
  const metrics = dashboardData?.metrics || {};
  const title = dashboardData ? (manager ? 'Dashboard' : 'My Tasks') : 'Loading workspace';
  const canCreate = dashboardData ? canCreateTasks(dashboardData.role) : false;

  return <AppShell title={title} eyebrow="Workspace" actions={canCreate ? <Link className="button button-primary" href="/tasks?create=1"><Icon name="plus" size={17} />Create task</Link> : null}>
    {!dashboardData ? <IntroSkeleton /> : <section className="overview-intro"><p>Good morning, <strong>{dashboardData.name}</strong></p><span>Here is what needs your attention.</span></section>}
    {error && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    <section className="metric-grid overview-metrics" aria-label="Task summary">
    {!dashboardData ? <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></> : <><MetricCard label="Total tasks" value={metrics.total} href="/tasks" /><MetricCard label="Pending" value={metrics.pending} tone="purple" href="/tasks?status=pending" /><MetricCard label="Overdue" value={metrics.overdue} tone={metrics.overdue ? 'orange' : 'green'} href="/tasks?status=overdue" /><MetricCard label="Completed" value={metrics.completed} tone="mint" href="/tasks?status=completed" /></>}
    </section>
    {dashboardData ? <DashboardTodayWork manager={manager} employees={dashboardData.employees} todayTasks={dashboardData.todayTasks} /> : <section className="panel overview-panel" aria-label="Loading today&apos;s tasks"><Loader label="Loading today&apos;s tasks..." /></section>}
  </AppShell>;
}
