import { supabaseBrowser } from './supabase-browser';

const baseSelect = '*,assignee:employees!tasks_assignee_id_fkey(id,name,email,role)';

function dateInputToIso(value, endOfDay = false) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getTasks({ limit = 100 } = {}) {
  const supabase = supabaseBrowser();
  const response = await supabase.from('tasks').select(baseSelect).order('updated_at', { ascending: false }).limit(limit);
  if (response.error && response.error.message?.includes('updated_at')) {
    return supabase.from('tasks').select(baseSelect).order('created_at', { ascending: false }).limit(limit);
  }
  return response;
}

export async function getTask(id) {
  return supabaseBrowser().from('tasks').select(baseSelect).eq('id', id).single();
}

export async function createTask(payload, userId) {
  const supabase = supabaseBrowser();
  const record = {
    ...payload,
    created_by: userId,
    status: 'pending',
    category: payload.category?.trim() || 'General',
    eta: dateInputToIso(payload.eta, true),
    start_date: dateInputToIso(payload.start_date),
    instructions: payload.instructions?.trim() || null,
    completion_notes: payload.completion_notes?.trim() || null,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
  };
  const response = await supabase.from('tasks').insert(record).select().single();
  if (response.error && /category|instructions|start_date|completion_notes|attachments/i.test(response.error.message || '')) {
    const fallback = { ...record };
    delete fallback.category;
    delete fallback.instructions;
    delete fallback.start_date;
    delete fallback.completion_notes;
    delete fallback.attachments;
    return supabase.from('tasks').insert(fallback).select().single();
  }
  return response;
}

export async function updateTaskStatus(id, status) {
  const fields = { status, updated_at: new Date().toISOString() };
  if (status === 'submitted') fields.submitted_at = new Date().toISOString();
  if (status === 'closed') fields.completed_at = new Date().toISOString();
  return supabaseBrowser().from('tasks').update(fields).eq('id', id);
}

export function taskIsOverdue(task) {
  return Boolean(task.eta && new Date(task.eta) < new Date() && !['closed', 'not_required'].includes(task.status));
}

export function taskIsDueSoon(task) {
  if (!task.eta || ['closed', 'not_required'].includes(task.status)) return false;
  const due = new Date(task.eta).getTime();
  const now = Date.now();
  return due >= now && due - now <= 48 * 60 * 60 * 1000;
}
