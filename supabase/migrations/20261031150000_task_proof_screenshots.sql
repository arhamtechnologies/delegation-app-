-- Screenshot proof for completed tasks.
--   * Private bucket `task-proofs`; objects live at `<task_id>/<random>.webp|jpg`.
--   * Only people who can see the task (managers, the assignee, the follower EA) can upload or view.
--   * A proof is a task_updates row with update_type = 'proof' and proof_url = the object path.
--   * A task with proof_required cannot be moved to `closed` until it has a proof row.
--   * /api/tasks/proofs/cleanup deletes objects older than 30 days (via the Storage API) and clears proof_url;
--     the proof row stays, so the task still counts as proven.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-proofs', 'task-proofs', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- True when the signed-in user may work on the task named by p_task (a uuid string, e.g. a storage folder).
create or replace function public.can_work_on_task(p_task text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_employee_id uuid;
begin
  if p_task is null or p_task !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_task_id := p_task::uuid;
  select id into v_employee_id from public.employees where auth_user_id = auth.uid() limit 1;
  return exists (
    select 1 from public.tasks t
    where t.id = v_task_id
      and (public.is_manager() or t.assignee_id = v_employee_id or t.follower_ea_id = v_employee_id)
  );
end;
$$;
revoke all on function public.can_work_on_task(text) from public, anon;
grant execute on function public.can_work_on_task(text) to authenticated;

drop policy if exists "task proofs upload" on storage.objects;
create policy "task proofs upload" on storage.objects for insert to authenticated
with check (bucket_id = 'task-proofs' and public.can_work_on_task((storage.foldername(name))[1]));

drop policy if exists "task proofs read" on storage.objects;
create policy "task proofs read" on storage.objects for select to authenticated
using (bucket_id = 'task-proofs' and public.can_work_on_task((storage.foldername(name))[1]));

-- Clients may only attach a proof on 'proof' rows, pointing at a file actually uploaded to the task's own folder.
drop policy if exists "updates proof path" on public.task_updates;
create policy "updates proof path" on public.task_updates as restrictive for insert to authenticated
with check (
  (update_type <> 'proof' and proof_url is null)
  or (
    update_type = 'proof'
    and proof_url like task_id::text || '/%'
    and public.can_work_on_task(task_id::text)
    and exists (select 1 from storage.objects o where o.bucket_id = 'task-proofs' and o.name = proof_url)
  )
);

-- The app treats a task as done when status is closed/not_required or completed_at is set, so check the
-- effective state on every update, not just status changes. Managers and trusted backends (service role,
-- SQL editor: no auth.uid()) may cancel without proof and change proof_required; assignees may not.
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

-- Storage objects older than p_before (includes orphans whose proof row was never written).
create or replace function public.expired_task_proofs(p_before timestamptz, p_limit integer default 1000)
returns table (name text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'task-proofs' and o.created_at < p_before
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
$$;
revoke all on function public.expired_task_proofs(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.expired_task_proofs(timestamptz, integer) to service_role;

create index if not exists task_updates_proof_idx on public.task_updates (task_id) where update_type = 'proof' or proof_url is not null;
