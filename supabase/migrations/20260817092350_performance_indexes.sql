-- Support the list, dashboard, MIS, detail, and notification queries without
-- changing their result sets or the existing RLS policies.
create index if not exists tasks_updated_at_idx
  on public.tasks(updated_at desc);

create index if not exists tasks_assignee_eta_idx
  on public.tasks(assignee_id, eta desc);

create index if not exists tasks_status_eta_idx
  on public.tasks(status, eta);

create index if not exists tasks_completed_at_idx
  on public.tasks(completed_at desc);

create index if not exists task_updates_task_created_at_idx
  on public.task_updates(task_id, created_at asc);

create index if not exists employees_active_name_idx
  on public.employees(active, name);

create index if not exists checklist_items_due_date_status_idx
  on public.checklist_items(due_date, status);

create index if not exists checklist_items_employee_due_date_status_idx
  on public.checklist_items(employee_id, due_date, status);

create index if not exists checklist_items_due_at_status_idx
  on public.checklist_items(due_at, status);

create index if not exists checklist_templates_active_created_at_idx
  on public.checklist_templates(active, created_at desc);
