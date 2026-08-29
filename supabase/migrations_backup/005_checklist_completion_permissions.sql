-- Allow checklist completion by super admins and EAs for any employee while
-- retaining assigned-item completion for doers and assigners.
drop policy if exists "checklist items complete own" on public.checklist_items;
drop policy if exists "checklist items complete" on public.checklist_items;

create policy "checklist items complete" on public.checklist_items
  for update to authenticated
  using (
    checklist_items.status in ('pending', 'overdue')
    and
    exists (
      select 1
      from public.employees current_employee
      where current_employee.auth_user_id = (select auth.uid())
        and (
          current_employee.role in ('super_admin', 'ea')
          or current_employee.id = checklist_items.employee_id
        )
    )
  )
  with check (
    status = 'completed'
    and completed_by = (select auth.uid())
    and exists (
      select 1
      from public.employees current_employee
      where current_employee.auth_user_id = (select auth.uid())
        and (
          current_employee.role in ('super_admin', 'ea')
          or current_employee.id = checklist_items.employee_id
        )
    )
  );
