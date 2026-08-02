insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners upload avatar objects" on storage.objects;
drop policy if exists "Owners delete avatar objects" on storage.objects;

create policy "Owners upload avatar objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Owners delete avatar objects"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and owner_id = (select auth.uid())::text
);
