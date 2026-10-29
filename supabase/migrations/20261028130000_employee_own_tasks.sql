-- Employees can add tasks for themselves (daily to-dos). Managers keep delegating
-- through the existing "tasks create" policy; this one only allows self-assigned rows.
drop policy if exists "tasks create own" on public.tasks;
create policy "tasks create own" on public.tasks for insert to authenticated
with check (
  created_by = auth.uid()
  and assignee_id = (select id from public.employees where auth_user_id = auth.uid() and active)
);
