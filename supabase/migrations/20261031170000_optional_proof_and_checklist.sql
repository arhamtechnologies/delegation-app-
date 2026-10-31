-- Proof is chosen per task and extends (always optional) to checklist items.
-- Run after 20261031150000_task_proof_screenshots.sql. Safe to run again.
--   * tasks.proof_required = true  -> "Mandatory": the task cannot be completed without a screenshot.
--     tasks.proof_required = false -> "Optional": a screenshot can be added, but is not needed.
--     The director/EA picks one every time a task is assigned (app form and WhatsApp bot).
--   * Checklist screenshots share the `task-proofs` bucket under `checklist/<checklist_item_id>/...`.
--   * A checklist proof is a checklist_item_updates row with update_type = 'proof' and proof_url = the object path.

-- Tasks created before this choice existed never had a real one (the old checkbox and the bot defaulted to
-- "needs proof"), so they become optional. Runs only on the first apply: can_work_on_checklist_item is
-- created further down, so re-running this file never flips tasks that were deliberately made mandatory.
do $$
begin
  if to_regprocedure('public.can_work_on_checklist_item(text)') is null then
    update public.tasks set proof_required = false where proof_required;
  end if;
end;
$$;
-- Anything that inserts a task without choosing gets "Optional".
alter table public.tasks alter column proof_required set default false;

-- Same rule as the previous migration, restated so this file alone leaves it in place.
-- The app treats a task as done when status is closed/not_required or completed_at is set, so check the
-- effective state on every update. Managers and trusted backends (service role, SQL editor: no auth.uid())
-- may cancel without proof and switch a task between mandatory and optional; assignees may not.
create or replace function public.enforce_task_completion_proof()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_privileged boolean := auth.uid() is null or public.is_manager();
  v_was_done boolean := old.status in ('closed', 'not_required') or old.completed_at is not null;
  v_now_done boolean := new.status = 'closed' or new.completed_at is not null or (new.status = 'not_required' and not v_privileged);
begin
  if new.proof_required is distinct from old.proof_required and not v_privileged then
    raise exception 'Only managers can change whether a task needs proof.' using errcode = '42501';
  end if;
  if v_now_done and not v_was_done and new.proof_required and not exists (
       select 1 from public.task_updates u
       where u.task_id = new.id and (u.update_type = 'proof' or u.proof_url is not null)
     ) then
    raise exception 'Add a proof screenshot before completing this task.'
      using errcode = 'P0001', hint = 'proof_required';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_task_completion_proof() from public, anon, authenticated;

drop trigger if exists task_completion_proof on public.tasks;
create trigger task_completion_proof
before update on public.tasks
for each row execute function public.enforce_task_completion_proof();

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
