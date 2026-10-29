'use client';

import { supabaseBrowser } from './supabase-browser';
import { getAccessToken } from './auth';
import { defaultChecklistTimeZone, formatChecklistDueAt, formatChecklistTime, getChecklistBusinessDate } from './checklist-time';
import { getUnifiedWorkItemStatus } from './work-summary.mjs';
import { getWorkQueryError } from './work-list.mjs';

export const checklistManagerRoles = ['super_admin', 'assigner', 'ea'];
export const nonWorkingDayManagerRoles = ['super_admin', 'ea'];
export const checklistWeekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const checklistFrequencies = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every_15_days', label: 'Every 15 days' },
  { value: 'monthly', label: 'Monthly' },
];

export function canManageChecklists(role) {
  return checklistManagerRoles.includes(role);
}

export function canDeactivateNonWorkingDayTasks(role) {
  return nonWorkingDayManagerRoles.includes(role);
}

export function canCompleteChecklist(role, employeeId, assignedEmployeeId) {
  return ['super_admin', 'ea'].includes(role) || (['doer', 'assigner'].includes(role) && employeeId === assignedEmployeeId);
}

export function getChecklistTimeZone() {
  return process.env.NEXT_PUBLIC_CHECKLIST_TIMEZONE || defaultChecklistTimeZone;
}

export function getBusinessDate(value = new Date()) {
  return getChecklistBusinessDate(value, getChecklistTimeZone());
}

export { formatChecklistDueAt, formatChecklistTime };

export function formatEmployeeId(id) {
  return id ? `EMP-${id.slice(0, 6).toUpperCase()}` : '—';
}

export function formatChecklistDays(template) {
  if (template.frequency === 'daily') return 'Daily';
  if (template.frequency === 'weekly') return `Every ${checklistWeekdays[template.weekday] || 'week'}`;
  if (template.frequency === 'every_15_days') return 'Every 15 days';
  const days = template.monthly_days?.length ? template.monthly_days : [template.day_of_month];
  return `Monthly on the ${days.map((day) => `${day}${[11, 12, 13].includes(Number(day)) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[Number(day) % 10] || 'th')}`).join(' & ')}`;
}

export function getChecklistStatus(item, now = new Date()) {
  return getUnifiedWorkItemStatus(item, now, 'checklist');
}

export function getChecklistSchemaError(error) {
  const workQueryError = getWorkQueryError(error);
  if (workQueryError !== error) return workQueryError;
  if (error?.message && /(due_at|due_time|checklist_items|checklist_templates)/i.test(error.message) && /(column|relation|schema cache|does not exist)/i.test(error.message)) {
    const migration = /monthly_days/i.test(error.message) ? '006_checklist_monthly_days.sql' : '004_checklist_due_time.sql';
    return new Error(`Checklist database migration ${migration} is not applied. Apply the migration in Supabase, then retry.`);
  }
  return error;
}

export async function getChecklistTemplatesPage({ page = 0, pageSize = 40, search = '', employeeId, frequency = 'all', status = 'all', signal, includeCount = true, client } = {}) {
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 40));
  const normalizedPage = Math.max(0, Number(page) || 0);
  let query = (client || supabaseBrowser())
    .from('checklist_template_list')
    .select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,created_at,updated_at,employee_name,employee_email', includeCount ? { count: 'exact' } : {})
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(normalizedPage * normalizedPageSize, (normalizedPage + 1) * normalizedPageSize - 1);
  if (search.trim()) query = query.ilike('search_text', `%${search.trim().slice(0, 120)}%`);
  if (employeeId && employeeId !== 'all') query = query.eq('employee_id', employeeId);
  if (frequency && frequency !== 'all') query = query.eq('frequency', frequency);
  if (status === 'active') query = query.eq('active', true);
  if (status === 'inactive') query = query.eq('active', false);
  if (signal) query = query.abortSignal(signal);
  const response = await query;
  return response.error ? { ...response, error: getChecklistSchemaError(response.error) } : {
    ...response,
    data: (response.data || []).map(({ employee_name, employee_email, ...template }) => ({
      ...template,
      employee: { id: template.employee_id, name: employee_name, email: employee_email },
    })),
  };
}

export async function getChecklistItems({ limit = 200, offset = 0, dueDate, dueDateFrom, dueDateTo, includeDeactivated = false, employeeId, status, nowIso = new Date().toISOString(), select = 'id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email),template:checklist_templates!checklist_items_template_id_fkey(frequency,weekday,day_of_month,monthly_days,start_date,due_time)', client } = {}) {
  const businessDate = getBusinessDate(new Date(nowIso));
  let query = (client || supabaseBrowser())
    .from('checklist_items')
    .select(select)
    .order('due_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (dueDate) query = query.eq('due_date', dueDate);
  if (dueDateFrom) query = query.gte('due_date', dueDateFrom);
  if (dueDateTo) query = query.lte('due_date', dueDateTo);
  if (employeeId) query = query.eq('employee_id', employeeId);
  if (!includeDeactivated) query = query.neq('status', 'deactivated');
  if (status === 'completed') query = query.or('status.eq.completed,completed_at.not.is.null');
  if (status === 'overdue') query = query.neq('status', 'completed').is('completed_at', null).or(`due_at.lt.${nowIso},and(due_at.is.null,due_date.lt.${businessDate})`);
  if (status === 'pending') query = query.neq('status', 'completed').is('completed_at', null).or(`due_at.gte.${nowIso},and(due_at.is.null,due_date.gte.${businessDate})`);
  const response = await query;
  return response.error ? { ...response, error: getChecklistSchemaError(response.error) } : response;
}

export async function setChecklistCompletion(id, completed = true) {
  let accessToken = await getAccessToken();
  if (!accessToken) return { data: null, error: new Error('Your session has expired. Please sign in again.') };
  const completeRequest = (token) => fetch(`/api/checklist/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ completed }),
  });
  let response = await completeRequest(accessToken);
  if (response.status === 401) {
    accessToken = await getAccessToken({ forceRefresh: true });
    if (accessToken) response = await completeRequest(accessToken);
  }
  if (response.status === 401) {
    return { data: null, error: new Error('Your session has expired. Please sign in again.') };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { data: null, error: new Error(payload.error || `The checklist item could not be ${completed ? 'completed' : 'reopened'}.`) };
  return { data: payload.item || null, error: null, alreadyCompleted: payload.alreadyCompleted === true, alreadyReopened: payload.alreadyReopened === true };
}

export async function getChecklistItemUpdates(itemId) {
  return supabaseBrowser()
    .from('checklist_item_updates')
    .select('id,update_type,remark,proof_url,created_at')
    .eq('checklist_item_id', itemId)
    .order('created_at', { ascending: true });
}

export async function addChecklistItemUpdate(itemId, authorUserId, remark) {
  return supabaseBrowser()
    .from('checklist_item_updates')
    .insert({ checklist_item_id: itemId, author_user_id: authorUserId, update_type: 'remark', remark: remark.trim() });
}

export async function triggerChecklistGeneration() {
  const accessToken = await getAccessToken();
  if (!accessToken) return { success: false, error: 'Your session has expired. Please sign in again.' };
  const response = await fetch('/api/checklist/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { success: false, error: payload.error || 'Checklist generation failed.' };
  return { success: payload.success !== false, ...payload };
}

const GENERATED_ON_KEY = 'dl_checklist_generated_on';

// Page visits only need generation once per business day per browser; template saves
// still call triggerChecklistGeneration directly, and the daily cron covers the rest.
export async function ensureChecklistGeneratedToday() {
  const today = getBusinessDate();
  try {
    if (window.localStorage.getItem(GENERATED_ON_KEY) === today) return { success: true, created: 0, skipped: true };
  } catch { /* storage unavailable: just generate */ }
  const response = await triggerChecklistGeneration();
  if (response?.success) {
    try { window.localStorage.setItem(GENERATED_ON_KEY, today); } catch { /* ignore */ }
  }
  return response;
}

export async function getChecklistDashboardData({ now = new Date(), client } = {}) {
  const supabase = client || supabaseBrowser();
  const nowIso = now.toISOString();
  const today = getBusinessDate(now);
  const baseCountQuery = () => supabase.from('checklist_items').select('id', { count: 'exact', head: true }).neq('status', 'deactivated');
  const totalQuery = baseCountQuery();
  const completedQuery = baseCountQuery().or('status.eq.completed,completed_at.not.is.null');
  const overdueQuery = baseCountQuery().neq('status', 'completed').is('completed_at', null).or(`due_at.lt.${nowIso},and(due_at.is.null,due_date.lt.${today})`);
  const pendingQuery = baseCountQuery().neq('status', 'completed').is('completed_at', null).or(`due_at.gte.${nowIso},and(due_at.is.null,due_date.gte.${today})`);
  const todayQuery = supabase
    .from('checklist_items')
    .select('id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email)')
    .eq('due_date', today)
    .neq('status', 'deactivated')
    .order('due_at', { ascending: true })
    .limit(500);
  const [totalResponse, completedResponse, overdueResponse, pendingResponse, todayResponse] = await Promise.all([
    totalQuery,
    completedQuery,
    overdueQuery,
    pendingQuery,
    todayQuery,
  ]);
  const responses = [totalResponse, completedResponse, overdueResponse, pendingResponse, todayResponse];
  const errorResponse = responses.find((response) => response.error);
  if (errorResponse) return { data: null, error: getChecklistSchemaError(errorResponse.error) };
  return {
    data: {
      metrics: {
        total: totalResponse.count || 0,
        completed: completedResponse.count || 0,
        overdue: overdueResponse.count || 0,
        pending: pendingResponse.count || 0,
      },
      todayItems: todayResponse.data || [],
    },
    error: null,
  };
}
