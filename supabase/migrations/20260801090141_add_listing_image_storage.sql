insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public listing images are readable" on storage.objects;
drop policy if exists "Owners upload listing images" on storage.objects;
drop policy if exists "Owners update listing images" on storage.objects;
drop policy if exists "Owners delete listing images" on storage.objects;

create policy "Public listing images are readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'listing-images');

create policy "Owners upload listing images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Owners update listing images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'listing-images'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Owners delete listing images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and owner_id = (select auth.uid())::text
);
