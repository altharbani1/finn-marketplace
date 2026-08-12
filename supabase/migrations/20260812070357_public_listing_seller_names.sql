-- Expose only the public display name associated with active marketplace listings.
-- The narrow response prevents anonymous clients from enumerating private
-- account and authorization data.
create or replace function public.get_public_listing_sellers(p_listing_ids uuid[])
returns table (
  listing_id uuid,
  seller_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select listing.id, coalesce(nullif(trim(profile.full_name), ''), 'معلن')
  from public.listings as listing
  join public.profiles as profile on profile.id = listing.user_id
  where listing.status = 'active'
    and listing.id = any(coalesce(p_listing_ids, array[]::uuid[]))
  order by listing.created_at desc
  limit 100;
$$;

revoke all on function public.get_public_listing_sellers(uuid[]) from public;
grant execute on function public.get_public_listing_sellers(uuid[]) to anon, authenticated;
