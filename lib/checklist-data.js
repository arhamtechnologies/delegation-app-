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
  return `Monthly on the ${template.day_of_month}${[11, 12, 13].includes(Number(template.day_of_month)) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[Number(template.day_of_month) % 10] || 'th')}`;
}

export function getChecklistStatus(item, now = new Date()) {
  if (item?.status === 'completed' || item?.completed_at) return 'completed';
  if (item?.due_at) {
    const dueAt = new Date(item.due_at);
    if (!Number.isNaN(dueAt.getTime())) return now.getTime() > dueAt.getTime() ? 'overdue' : 'pending';
  }
  return getBusinessDate(now) > item?.due_date ? 'overdue' : 'pending';
}

export async function getChecklistItems({ limit = 200, dueDate } = {}) {
  let query = supabaseBrowser()
    .from('checklist_items')
    .select('id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email),template:checklist_templates!checklist_items_template_id_fkey(frequency,weekday,day_of_month,start_date,due_time)')
    .order('due_at', { ascending: false })
    .limit(limit);
  if (dueDate) query = query.eq('due_date', dueDate);
  return query;
}

export async function setChecklistCompletion(id, completed = true) {
  if (!completed) return { data: null, error: new Error('Completed checklist items cannot be reopened.') };
  const { data: { user } = {} } = await supabaseBrowser().auth.getUser();
  if (!user) return { data: null, error: new Error('Your session has expired. Please sign in again.') };
  return supabaseBrowser().from('checklist_items').update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: user.id }).eq('id', id);
}

export async function triggerChecklistGeneration() {
  const { data: { session } = {} } = await supabaseBrowser().auth.getSession();
  if (!session?.access_token) return null;
  const response = await fetch('/api/checklist/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  return response.json().catch(() => null);
}
