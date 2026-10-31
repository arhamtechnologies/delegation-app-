-- Proof screenshots become optional and extend to checklist items.
-- Run after 20261031150000_task_proof_screenshots.sql.
--   * Removes the rule that blocked closing a proof-required task without a screenshot.
--   * Checklist screenshots share the `task-proofs` bucket under `checklist/<checklist_item_id>/...`.
--   * A checklist proof is a checklist_item_updates row with update_type = 'proof' and proof_url = the object path.

drop trigger if exists task_completion_proof on public.tasks;
drop function if exists public.enforce_task_completion_proof();

-- True when the signed-in user may work on the checklist item: managers, or the employee it belongs to.
create or replace function public.can_work_on_checklist_item(p_item text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  if p_item is null or p_item !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_item_id := p_item::uuid;
  return exists (
    select 1 from public.checklist_items i
    where i.id = v_item_id
      and (public.is_manager() or i.employee_id = (select e.id from public.employees e where e.auth_user_id = auth.uid() limit 1))
  );
end;
$$;
revoke all on function public.can_work_on_checklist_item(text) from public, anon;
grant execute on function public.can_work_on_checklist_item(text) to authenticated;

-- Bucket access: `<task_id>/...` for tasks, `checklist/<checklist_item_id>/...` for checklist items.
drop policy if exists "task proofs upload" on storage.objects;
create policy "task proofs upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-proofs'
  and case when (storage.foldername(name))[1] = 'checklist'
    then public.can_work_on_checklist_item((storage.foldername(name))[2])
    else public.can_work_on_task((storage.foldername(name))[1])
  end
);

drop policy if exists "task proofs read" on storage.objects;
create policy "task proofs read" on storage.objects for select to authenticated
using (
  bucket_id = 'task-proofs'
  and case when (storage.foldername(name))[1] = 'checklist'
    then public.can_work_on_checklist_item((storage.foldername(name))[2])
    else public.can_work_on_task((storage.foldername(name))[1])
  end
);

-- Clients may only attach a proof on 'proof' rows, pointing at a file actually uploaded to the item's own folder.
drop policy if exists "checklist updates proof path" on public.checklist_item_updates;
create policy "checklist updates proof path" on public.checklist_item_updates as restrictive for insert to authenticated
with check (
  (update_type <> 'proof' and proof_url is null)
  or (
    update_type = 'proof'
    and proof_url like 'checklist/' || checklist_item_id::text || '/%'
    and exists (select 1 from storage.objects o where o.bucket_id = 'task-proofs' and o.name = proof_url)
  )
);

create index if not exists checklist_item_updates_proof_idx on public.checklist_item_updates (checklist_item_id) where update_type = 'proof';
