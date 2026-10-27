-- Extra WhatsApp numbers that act through an existing manager account (no app login needed).
-- Work done from such a number is saved under that account, as the app records an author per change.
create table if not exists public.wa_chat_links(
  chat_id text primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
create index if not exists wa_chat_links_employee_idx on public.wa_chat_links(employee_id);
alter table public.wa_chat_links enable row level security;

-- Anekant Jain (director) chats through the Administrator account.
insert into public.wa_chat_links(chat_id, employee_id, display_name)
select '919575011337@c.us', id, 'Anekant Jain'
from public.employees
where role = 'super_admin' and whatsapp_chat_id = '919770207789@c.us'
on conflict (chat_id) do update set employee_id = excluded.employee_id, display_name = excluded.display_name;
