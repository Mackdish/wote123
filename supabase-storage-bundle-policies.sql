-- Allow authorized Library/Bundle managers to create and manage generated ZIP archives.
-- Run this once in the Supabase SQL Editor for the project used by WTTI SWMS.
-- The application authenticates with the user's JWT, so generated ZIP uploads
-- must be permitted by storage.objects RLS.

create policy "library bundles insert for admins"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 1) in ('_library', '_bundles')
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'deputy_principal')
  )
);

create policy "library bundles select for admins"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) in ('_library', '_bundles')
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'deputy_principal')
  )
);

create policy "library bundles delete for admins"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) in ('_library', '_bundles')
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'deputy_principal')
  )
);
