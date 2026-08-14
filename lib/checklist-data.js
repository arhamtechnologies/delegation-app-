'use client';

import { supabaseBrowser } from './supabase-browser';
import { defaultChecklistTimeZone, formatChecklistDueAt, formatChecklistTime, getChecklistBusinessDate } from './checklist-time';

export const checklistManagerRoles = ['super_admin', 'assigner', 'ea'];
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
  if (item?.status === 'completed' || item?.completed_at) return 'completed';
  if (item?.due_at) {
    const dueAt = new Date(item.due_at);
    if (!Number.isNaN(dueAt.getTime())) return now.getTime() > dueAt.getTime() ? 'overdue' : 'pending';
  }
  return getBusinessDate(now) > item?.due_date ? 'overdue' : 'pending';
}

export function getChecklistSchemaError(error) {
  if (error?.message && /(due_at|due_time|checklist_items|checklist_templates)/i.test(error.message) && /(column|relation|schema cache|does not exist)/i.test(error.message)) {
    const migration = /monthly_days/i.test(error.message) ? '006_checklist_monthly_days.sql' : '004_checklist_due_time.sql';
    return new Error(`Checklist database migration ${migration} is not applied. Apply the migration in Supabase, then retry.`);
  }
  return error;
}

export async function getChecklistItems({ limit = 200, dueDate } = {}) {
  let query = supabaseBrowser()
    .from('checklist_items')
    .select('id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email),template:checklist_templates!checklist_items_template_id_fkey(frequency,weekday,day_of_month,monthly_days,start_date,due_time)')
    .order('due_at', { ascending: false })
    .limit(limit);
  if (dueDate) query = query.eq('due_date', dueDate);
  const response = await query;
  return response.error ? { ...response, error: getChecklistSchemaError(response.error) } : response;
}

export async function setChecklistCompletion(id, completed = true) {
  if (!completed) return { data: null, error: new Error('Completed checklist items cannot be reopened.') };
  const supabase = supabaseBrowser();
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) return { data: null, error: new Error('Your session has expired. Please sign in again.') };
  const response = await fetch(`/api/checklist/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { data: null, error: new Error(payload.error || 'The checklist item could not be completed.') };
  return { data: payload.item || null, error: null, alreadyCompleted: payload.alreadyCompleted === true };
}

export async function triggerChecklistGeneration() {
  const { data: { session } = {} } = await supabaseBrowser().auth.getSession();
  if (!session?.access_token) return { success: false, error: 'Your session has expired. Please sign in again.' };
  const response = await fetch('/api/checklist/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { success: false, error: payload.error || 'Checklist generation failed.' };
  return { success: payload.success !== false, ...payload };
}
