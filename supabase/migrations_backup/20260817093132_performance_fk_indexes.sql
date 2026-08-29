-- Additive foreign-key indexes for joins and parent-row updates. These do not
-- change RLS policies or application authorization behavior.
create index if not exists employees_department_id_idx on public.employees(department_id);
create index if not exists employees_designation_id_idx on public.employees(designation_id);
create index if not exists employees_shift_id_idx on public.employees(shift_id);
create index if not exists tasks_created_by_idx on public.tasks(created_by);
create index if not exists tasks_follower_ea_id_idx on public.tasks(follower_ea_id);
create index if not exists task_updates_author_user_id_idx on public.task_updates(author_user_id);
create index if not exists notifications_actor_employee_id_idx on public.notifications(actor_employee_id);
create index if not exists notifications_task_id_idx on public.notifications(task_id);
create index if not exists checklist_templates_created_by_idx on public.checklist_templates(created_by);
create index if not exists checklist_items_completed_by_idx on public.checklist_items(completed_by);
create index if not exists employee_leave_periods_created_by_idx on public.employee_leave_periods(created_by);
create index if not exists employee_non_working_days_created_by_idx on public.employee_non_working_days(created_by);
create index if not exists checklist_non_working_day_operations_performed_by_idx on public.checklist_non_working_day_operations(performed_by);
