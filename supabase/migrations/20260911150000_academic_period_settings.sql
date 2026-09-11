create table if not exists public.academic_period_settings (
  id integer primary key default 1 check (id = 1),
  academic_year text not null,
  term text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.academic_period_settings enable row level security;

drop policy if exists "Authenticated users can read academic period" on public.academic_period_settings;
create policy "Authenticated users can read academic period"
  on public.academic_period_settings for select
  to authenticated
  using (true);

drop policy if exists "Administrators can manage academic period" on public.academic_period_settings;
create policy "Administrators can manage academic period"
  on public.academic_period_settings for all
  to authenticated
  using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));

insert into public.academic_period_settings (id, academic_year, term)
values (1, concat(extract(year from current_date)::text, '/', (extract(year from current_date)::int + 1)::text), 'Term 1')
on conflict (id) do nothing;
