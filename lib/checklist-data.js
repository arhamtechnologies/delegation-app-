'use client';

import { supabaseBrowser } from './supabase-browser';

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
  return process.env.NEXT_PUBLIC_CHECKLIST_TIMEZONE || 'Asia/Kolkata';
}

export function getBusinessDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getChecklistTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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
  return getBusinessDate(now) > item?.due_date ? 'overdue' : 'pending';
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
