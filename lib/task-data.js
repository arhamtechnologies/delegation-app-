import { supabaseBrowser } from './supabase-browser';

const taskListSelect = 'id,title,description,priority,status,eta,category,assignee:employees!tasks_assignee_id_fkey(name)';
const taskSummarySelect = 'id,title,priority,status,eta,category,assignee:employees!tasks_assignee_id_fkey(name)';
const taskDetailSelect = 'id,title,description,priority,status,eta,start_date,category,instructions,proof_required,completion_notes,attachments,created_at,updated_at,assignee:employees!tasks_assignee_id_fkey(name)';
const excludedTaskAssigneeRoles = new Set(['super_admin', 'assigner', 'ea']);

export function isEligibleTaskAssignee(employee) {
  return employee?.active === true && !excludedTaskAssigneeRoles.has(employee.role);
}

export async function getTaskAssignees() {
  const response = await supabaseBrowser()
    .from('employees')
    .select('id,name,active,role')
    .eq('active', true)
    .not('role', 'in', '("super_admin","assigner","ea")')
    .order('name');

  if (response.error) return response;
  return { ...response, data: (response.data || []).filter(isEligibleTaskAssignee) };
}

async function getTaskAssignee(id) {
  return supabaseBrowser().from('employees').select('id,active,role').eq('id', id).maybeSingle();
}

function dateInputToIso(value, endOfDay = false) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getTasks({ limit = 100, select = taskListSelect } = {}) {
  const supabase = supabaseBrowser();
  const response = await supabase.from('tasks').select(select).order('updated_at', { ascending: false }).limit(limit);
  if (response.error && response.error.message?.includes('updated_at')) {
    return supabase.from('tasks').select(select).order('created_at', { ascending: false }).limit(limit);
  }
  return response;
}

function activeTaskQuery(query) {
  return query.neq('status', 'closed').neq('status', 'not_required');
}

export async function getDashboardData(manager) {
  const supabase = supabaseBrowser();
  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const overdueCount = activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }).lt('eta', nowIso));
  const priorityQueries = [
    activeTaskQuery(supabase.from('tasks').select(taskSummarySelect).lt('eta', nowIso).order('eta', { ascending: true }).limit(8)),
    activeTaskQuery(supabase.from('tasks').select(taskSummarySelect).gte('eta', nowIso).lte('eta', soonIso).order('eta', { ascending: true }).limit(8)),
  ];
  const metricQueries = manager
    ? [
      ['total', supabase.from('tasks').select('id', { count: 'exact', head: true })],
      ['overdue', overdueCount],
      ['dueSoon', activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('eta', nowIso).lte('eta', soonIso))],
    ]
    : [
      ['open', activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }))],
      ['dueToday', activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('eta', todayStart.toISOString()).lt('eta', tomorrowStart.toISOString()))],
      ['overdue', overdueCount],
      ['completed', supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'closed')],
    ];

  const [metricResponses, priorityResponses] = await Promise.all([
    Promise.all(metricQueries.map(([, query]) => query)),
    Promise.all(priorityQueries),
  ]);
  const errorResponse = [...metricResponses, ...priorityResponses].find((response) => response.error);
  if (errorResponse) return { data: null, error: errorResponse.error };

  const metrics = Object.fromEntries(metricQueries.map(([key], index) => [key, metricResponses[index].count || 0]));
  const priorityTasks = [...priorityResponses[0].data || [], ...priorityResponses[1].data || []]
    .filter((task, index, tasks) => tasks.findIndex((candidate) => candidate.id === task.id) === index)
    .sort((left, right) => new Date(left.eta) - new Date(right.eta))
    .slice(0, 8);

  return { data: { metrics, priorityTasks }, error: null };
}

export async function getTask(id) {
  return supabaseBrowser().from('tasks').select(taskDetailSelect).eq('id', id).single();
}

export async function createTask(payload, userId) {
  const supabase = supabaseBrowser();
  if (!payload.assignee_id) {
    return { data: null, error: new Error('Choose an active employee who can receive delegated tasks.') };
  }
  const assigneeResponse = await getTaskAssignee(payload.assignee_id);
  if (assigneeResponse.error) return { data: null, error: assigneeResponse.error };
  if (!isEligibleTaskAssignee(assigneeResponse.data)) {
    return { data: null, error: new Error('Choose an active employee who can receive delegated tasks.') };
  }
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
  const response = await supabase.from('tasks').insert(record);
  if (response.error && /category|instructions|start_date|completion_notes|attachments/i.test(response.error.message || '')) {
    const fallback = { ...record };
    delete fallback.category;
    delete fallback.instructions;
    delete fallback.start_date;
    delete fallback.completion_notes;
    delete fallback.attachments;
    return supabase.from('tasks').insert(fallback);
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
