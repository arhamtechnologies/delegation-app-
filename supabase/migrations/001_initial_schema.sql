create extension if not exists pgcrypto;
create type public.app_role as enum ('super_admin','assigner','ea','doer');
create type public.task_status as enum ('pending','followup','delayed','submitted','closed','not_required');
create type public.task_priority as enum ('normal','high','critical');

create table public.shifts(id uuid primary key default gen_random_uuid(),name text not null,work_days int[] not null default '{1,2,3,4,5,6}',start_time time not null default '09:30',end_time time not null default '18:30',active boolean not null default true,created_at timestamptz default now());
create table public.departments(id uuid primary key default gen_random_uuid(),name text unique not null,active boolean default true);
create table public.designations(id uuid primary key default gen_random_uuid(),name text unique not null,active boolean default true);
create table public.employees(id uuid primary key default gen_random_uuid(),auth_user_id uuid unique references auth.users(id) on delete set null,name text not null,email text,mobile text,company_mobile text,role public.app_role not null default 'doer',department_id uuid references public.departments(id),designation_id uuid references public.designations(id),shift_id uuid references public.shifts(id),active boolean not null default true,must_change_password boolean not null default true,created_at timestamptz default now());
create table public.tasks(id uuid primary key default gen_random_uuid(),title text not null,description text,priority public.task_priority not null default 'normal',status public.task_status not null default 'pending',created_by uuid not null references auth.users(id),assignee_id uuid not null references public.employees(id),follower_ea_id uuid references public.employees(id),eta timestamptz not null,original_eta timestamptz,eta_revised boolean not null default false,proof_required boolean not null default true,proof_note text,submitted_at timestamptz,completed_at timestamptz,cancel_reason text,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.task_updates(id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks(id) on delete cascade,author_user_id uuid not null references auth.users(id),update_type text not null default 'remark',remark text,new_eta timestamptz,proof_url text,created_at timestamptz default now());

create or replace function public.current_employee() returns public.employees language sql stable security definer set search_path=public as $$ select * from public.employees where auth_user_id=auth.uid() limit 1 $$;
create or replace function public.is_manager() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select role in ('super_admin','assigner','ea') from public.employees where auth_user_id=auth.uid()),false) $$;

alter table public.employees enable row level security;alter table public.tasks enable row level security;alter table public.task_updates enable row level security;alter table public.shifts enable row level security;alter table public.departments enable row level security;alter table public.designations enable row level security;
create policy "authenticated read masters" on public.shifts for select to authenticated using(true);create policy "authenticated read departments" on public.departments for select to authenticated using(true);create policy "authenticated read designations" on public.designations for select to authenticated using(true);
create policy "employees read" on public.employees for select to authenticated using(public.is_manager() or auth_user_id=auth.uid());
create policy "employees manage" on public.employees for all to authenticated using(public.is_manager()) with check(public.is_manager());
create policy "tasks read" on public.tasks for select to authenticated using(public.is_manager() or assignee_id=(select id from public.employees where auth_user_id=auth.uid()) or follower_ea_id=(select id from public.employees where auth_user_id=auth.uid()));
create policy "tasks create" on public.tasks for insert to authenticated with check(public.is_manager() and created_by=auth.uid());
create policy "tasks update" on public.tasks for update to authenticated using(public.is_manager() or assignee_id=(select id from public.employees where auth_user_id=auth.uid()));
create policy "updates read" on public.task_updates for select to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and (public.is_manager() or t.assignee_id=(select id from public.employees where auth_user_id=auth.uid()) or t.follower_ea_id=(select id from public.employees where auth_user_id=auth.uid()))));
create policy "updates add" on public.task_updates for insert to authenticated with check(author_user_id=auth.uid());

create or replace view public.employee_mis with (security_invoker=true) as
select e.id employee_id,e.name employee_name,count(t.id)::int total_tasks,count(*) filter(where t.status in ('pending','followup'))::int pending_tasks,count(*) filter(where t.status='delayed' or (t.completed_at is not null and t.completed_at>t.eta))::int delayed_tasks,count(*) filter(where t.status='closed')::int closed_tasks,coalesce(round(100.0*count(*) filter(where t.status='closed' and t.completed_at<=t.eta)/nullif(count(*) filter(where t.status='closed'),0),1),0) on_time_percent from public.employees e left join public.tasks t on t.assignee_id=e.id group by e.id,e.name;

insert into public.shifts(name) values ('General Shift') on conflict do nothing;
