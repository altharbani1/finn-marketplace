-- Specialist security hardening: least-privilege profile access, privileged
-- marketplace operations, immutable server-managed fields, and data checks.

-- Profiles contain private contact and authorization fields. Authenticated
-- clients may enumerate only the explicitly public columns; private/self and
-- administrative reads go through narrowly scoped RPCs below.
revoke select on public.profiles from authenticated;
grant select (id, full_name, avatar_url, rating, verified_seller, created_at)
on public.profiles to authenticated;

-- Existing RLS policies must not read the private role column as the caller.
-- This helper exposes only the caller's administrator decision and performs
-- the private lookup with a fixed search path.
drop function if exists public.is_marketplace_admin();
create function public.is_marketplace_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function public.is_marketplace_admin()
from public, anon, authenticated;
grant execute on function public.is_marketplace_admin() to authenticated;

drop policy if exists "Owners and admins read listings" on public.listings;
create policy "Owners and admins read listings" on public.listings
for select to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.is_marketplace_admin())
);

drop policy if exists "Owners and admins update listings" on public.listings;
create policy "Owners and admins update listings" on public.listings
for update to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.is_marketplace_admin())
)
with check (
  (select auth.uid()) = user_id
  or (select public.is_marketplace_admin())
);

drop policy if exists "Owners and admins delete listings" on public.listings;
create policy "Owners and admins delete listings" on public.listings
for delete to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.is_marketplace_admin())
);

drop policy if exists "Authors owners and admins delete comments" on public.comments;
create policy "Authors owners and admins delete comments" on public.comments
for delete to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1 from public.listings l
    where l.id = listing_id and l.user_id = (select auth.uid())
  )
  or (select public.is_marketplace_admin())
);

drop policy if exists "Admins read reports" on public.reports;
create policy "Admins read reports" on public.reports
for select to authenticated
using ((select public.is_marketplace_admin()));

drop policy if exists "Admins update reports" on public.reports;
create policy "Admins update reports" on public.reports
for update to authenticated
using ((select public.is_marketplace_admin()))
with check ((select public.is_marketplace_admin()));

drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  phone_number text,
  city text,
  role public.user_role,
  verified_seller boolean,
  rating numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  return query
  select p.id, p.full_name, p.avatar_url, p.phone_number, p.city, p.role,
         p.verified_seller, p.rating, p.created_at, p.updated_at
  from public.profiles p
  where p.id = caller_id;
end;
$$;
revoke all on function public.get_my_profile() from public, anon, authenticated;
grant execute on function public.get_my_profile() to authenticated;

drop function if exists public.get_listing_contact(uuid);
create function public.get_listing_contact(p_listing_id uuid)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  phone_number text,
  rating numeric,
  verified_seller boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  return query
  select p.id, p.full_name, p.avatar_url, p.phone_number, p.rating, p.verified_seller
  from public.listings l
  join public.profiles p on p.id = l.user_id
  where l.id = p_listing_id
    and l.status = 'active';
end;
$$;
revoke all on function public.get_listing_contact(uuid) from public, anon, authenticated;
grant execute on function public.get_listing_contact(uuid) to authenticated;

drop function if exists public.get_admin_profiles();
create function public.get_admin_profiles()
returns table (
  id uuid,
  full_name text,
  phone_number text,
  role public.user_role,
  verified_seller boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not exists (
    select 1 from public.profiles p
    where p.id = caller_id and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Administrator access required';
  end if;

  return query
  select p.id, p.full_name, p.phone_number, p.role, p.verified_seller, p.created_at
  from public.profiles p
  order by p.created_at desc;
end;
$$;
revoke all on function public.get_admin_profiles() from public, anon, authenticated;
grant execute on function public.get_admin_profiles() to authenticated;

-- Force status changes through the administrator-only RPC. Owners retain
-- updates for editable listing content, but status is no longer grantable.
revoke insert on public.listings from authenticated;
grant insert (
  id, user_id, title, description, price, is_free, category_type,
  sub_category, condition, city, neighborhood, attributes, images
) on public.listings to authenticated;

revoke update on public.listings from authenticated;
revoke update (status) on public.listings from authenticated;
grant update (
  title, description, price, is_free, category_type, sub_category,
  condition, city, neighborhood, attributes, images, updated_at
) on public.listings to authenticated;

drop function if exists public.set_listing_status(uuid, public.listing_status);
create function public.set_listing_status(
  p_listing_id uuid,
  p_status public.listing_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not exists (
    select 1 from public.profiles p
    where p.id = caller_id and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Administrator access required';
  end if;
  if p_status is null then
    raise exception using errcode = '22023', message = 'Listing status is required';
  end if;

  update public.listings
  set status = p_status, updated_at = now()
  where id = p_listing_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Listing not found';
  end if;
end;
$$;
revoke all on function public.set_listing_status(uuid, public.listing_status)
from public, anon, authenticated;
grant execute on function public.set_listing_status(uuid, public.listing_status)
to authenticated;

drop function if exists public.delete_listing_as_admin(uuid);
create function public.delete_listing_as_admin(p_listing_id uuid)
returns table (owner_id uuid, images jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not exists (
    select 1 from public.profiles p
    where p.id = caller_id and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Administrator access required';
  end if;

  return query
  delete from public.listings l
  where l.id = p_listing_id
  returning l.user_id, l.images;
end;
$$;
revoke all on function public.delete_listing_as_admin(uuid)
from public, anon, authenticated;
grant execute on function public.delete_listing_as_admin(uuid) to authenticated;

drop policy if exists "Admins delete listing images" on storage.objects;
create policy "Admins delete listing images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and (select public.is_marketplace_admin())
);

-- Server-managed flags must not be writable through direct Data API inserts.
revoke insert on public.comments from authenticated;
grant insert (listing_id, user_id, comment_text)
on public.comments to authenticated;

revoke insert on public.reports from authenticated;
grant insert (listing_id, reporter_id, reason)
on public.reports to authenticated;

revoke update on public.chat_threads from authenticated;
revoke update (last_message, updated_at) on public.chat_threads from authenticated;

-- Rating writes are atomic and server-validated. Direct mutation grants are
-- removed so clients cannot split delete/insert operations or spoof sellers.
revoke insert, update, delete on public.seller_ratings from authenticated;
revoke insert (listing_id, seller_id, reviewer_id, rating)
on public.seller_ratings from authenticated;
revoke update (rating, updated_at)
on public.seller_ratings from authenticated;

drop function if exists public.upsert_seller_rating(uuid, uuid, smallint);
create function public.upsert_seller_rating(
  p_listing_id uuid,
  p_seller_id uuid,
  p_rating smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using errcode = '22023', message = 'Rating must be between 1 and 5';
  end if;
  if caller_id = p_seller_id then
    raise exception using errcode = '23514', message = 'Self-rating is not allowed';
  end if;
  if not exists (
    select 1 from public.listings l
    where l.id = p_listing_id
      and l.user_id = p_seller_id
      and l.status = 'active'
  ) then
    raise exception using errcode = '23503', message = 'Active listing and seller do not match';
  end if;

  insert into public.seller_ratings (listing_id, seller_id, reviewer_id, rating)
  values (p_listing_id, p_seller_id, caller_id, p_rating)
  on conflict (listing_id, reviewer_id)
  do update set rating = excluded.rating, updated_at = now();
end;
$$;
revoke all on function public.upsert_seller_rating(uuid, uuid, smallint)
from public, anon, authenticated;
grant execute on function public.upsert_seller_rating(uuid, uuid, smallint)
to authenticated;

-- Add constraints as NOT VALID so migration deployment never fails solely due
-- to legacy rows. Validate each one only when a preflight query proves safety.
alter table public.listings
  drop constraint if exists listings_price_nonnegative,
  add constraint listings_price_nonnegative
    check (price is not null and price >= 0) not valid,
  drop constraint if exists listings_free_price_consistent,
  add constraint listings_free_price_consistent
    check (is_free is not null and (not is_free or price = 0)) not valid,
  drop constraint if exists listings_title_length,
  add constraint listings_title_length
    check (char_length(btrim(title)) between 2 and 180) not valid,
  drop constraint if exists listings_description_length,
  add constraint listings_description_length
    check (char_length(btrim(description)) between 1 and 5000) not valid,
  drop constraint if exists listings_images_shape,
  add constraint listings_images_shape
    check (
      case
        when jsonb_typeof(images) = 'array' then jsonb_array_length(images) <= 15
        else false
      end
    ) not valid;

do $$
begin
  if not exists (select 1 from public.listings where price is null or price < 0) then
    alter table public.listings validate constraint listings_price_nonnegative;
  end if;
  if not exists (
    select 1 from public.listings
    where is_free is null or (is_free and price is distinct from 0::numeric)
  ) then
    alter table public.listings validate constraint listings_free_price_consistent;
  end if;
  if not exists (
    select 1 from public.listings
    where char_length(btrim(title)) not between 2 and 180
  ) then
    alter table public.listings validate constraint listings_title_length;
  end if;
  if not exists (
    select 1 from public.listings
    where char_length(btrim(description)) not between 1 and 5000
  ) then
    alter table public.listings validate constraint listings_description_length;
  end if;
  if not exists (
    select 1 from public.listings
    where case
      when jsonb_typeof(images) = 'array' then jsonb_array_length(images) > 15
      else true
    end
  ) then
    alter table public.listings validate constraint listings_images_shape;
  end if;
end
$$;
