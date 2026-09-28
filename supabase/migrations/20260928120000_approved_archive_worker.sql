-- Background generation for approved, stamped document archives.
create table if not exists public.approved_archive_jobs (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  department_id uuid null references public.departments(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  attempts integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz null,
  finished_at timestamptz null
);

create index if not exists approved_archive_jobs_status_created_idx
  on public.approved_archive_jobs(status, created_at);

alter table public.approved_archive_jobs enable row level security;

drop policy if exists "Archive managers can read preparation status" on public.approved_archive_jobs;
create policy "Archive managers can read preparation status"
  on public.approved_archive_jobs for select to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin', 'deputy_principal')
  ));

drop policy if exists "Archive managers can retry preparation" on public.approved_archive_jobs;
create policy "Archive managers can retry preparation"
  on public.approved_archive_jobs for update to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin', 'deputy_principal')
  ))
  with check (exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin', 'deputy_principal')
  ));

drop policy if exists "Archive managers can queue preparation" on public.approved_archive_jobs;
create policy "Archive managers can queue preparation"
  on public.approved_archive_jobs for insert to authenticated
  with check (exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin', 'deputy_principal')
  ));

create or replace function public.enqueue_approved_archive_scope(_department_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _scope_key text := case when _department_id is null then 'all' else 'department:' || _department_id::text end;
begin
  insert into public.approved_archive_jobs(scope_key, department_id, status, attempts, last_error, created_at, updated_at, claimed_at, finished_at)
  values (_scope_key, _department_id, 'queued', 0, null, now(), now(), null, null)
  on conflict (scope_key) do update
    set department_id = excluded.department_id,
        status = 'queued',
        attempts = 0,
        last_error = null,
        created_at = now(),
        updated_at = now(),
        claimed_at = null,
        finished_at = null;
end;
$$;

create or replace function public.enqueue_approved_archive_for_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if old.status = 'approved' then
      perform public.enqueue_approved_archive_scope(null);
      if old.department_id is not null then perform public.enqueue_approved_archive_scope(old.department_id); end if;
    end if;
    return old;
  end if;

  if TG_OP = 'INSERT' then
    if new.status = 'approved' then
      perform public.enqueue_approved_archive_scope(null);
      if new.department_id is not null then perform public.enqueue_approved_archive_scope(new.department_id); end if;
    end if;
    return new;
  end if;

  if new.status = 'approved' and (
    old.status is distinct from new.status
    or old.file_path is distinct from new.file_path
    or old.file_name is distinct from new.file_name
    or old.department_id is distinct from new.department_id
    or old.title is distinct from new.title
    or old.document_type is distinct from new.document_type
  ) then
    perform public.enqueue_approved_archive_scope(null);
    if new.department_id is not null then perform public.enqueue_approved_archive_scope(new.department_id); end if;
  end if;

  if old.status = 'approved' and new.status is distinct from 'approved' then
    perform public.enqueue_approved_archive_scope(null);
    if old.department_id is not null then perform public.enqueue_approved_archive_scope(old.department_id); end if;
  end if;

  return new;
end;
$$;

drop trigger if exists documents_enqueue_approved_archive on public.documents;
create trigger documents_enqueue_approved_archive
after insert or update or delete on public.documents
for each row execute function public.enqueue_approved_archive_for_document_change();

create or replace function public.enqueue_approved_archive_after_final_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _department_id uuid;
begin
  if new.action = 'approve' and new.role = 'iqa' then
    select department_id into _department_id from public.documents where id = new.document_id and status = 'approved';
    if found then
      perform public.enqueue_approved_archive_scope(null);
      if _department_id is not null then perform public.enqueue_approved_archive_scope(_department_id); end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists approval_history_enqueue_approved_archive on public.approval_history;
create trigger approval_history_enqueue_approved_archive
after insert on public.approval_history
for each row execute function public.enqueue_approved_archive_after_final_approval();

create or replace function public.claim_approved_archive_jobs(p_limit integer default 1)
returns setof public.approved_archive_jobs
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.approved_archive_jobs
    where status = 'queued'
    order by created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 10))
  )
  update public.approved_archive_jobs j
  set status = 'processing', attempts = j.attempts + 1, claimed_at = now(), updated_at = now(), last_error = null
  from picked
  where j.id = picked.id
  returning j.*;
$$;

revoke all on function public.claim_approved_archive_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_approved_archive_jobs(integer) to service_role;
revoke all on function public.enqueue_approved_archive_scope(uuid) from public, anon, authenticated;

-- Seed an initial all-departments archive and one archive per department.
select public.enqueue_approved_archive_scope(null);
select public.enqueue_approved_archive_scope(d.department_id)
from (
  select distinct department_id from public.documents
  where status = 'approved' and department_id is not null
) d;
