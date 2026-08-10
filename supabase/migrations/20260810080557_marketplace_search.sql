create extension if not exists pg_trgm with schema extensions;

drop function if exists public.search_marketplace_listings(text, integer, integer);
create function public.search_marketplace_listings(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  description text,
  price numeric,
  is_free boolean,
  category_type public.listing_category,
  sub_category text,
  condition public.item_condition,
  city text,
  neighborhood text,
  status public.listing_status,
  views_count integer,
  attributes jsonb,
  images jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  search_rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with search_input as (
    select left(
      lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g')),
      100
    ) as query
  ),
  ranked as (
    select
      listing.id,
      listing.user_id,
      listing.title,
      listing.description,
      listing.price,
      listing.is_free,
      listing.category_type,
      listing.sub_category,
      listing.condition,
      listing.city,
      listing.neighborhood,
      listing.status,
      listing.views_count,
      listing.attributes,
      listing.images,
      listing.created_at,
      listing.updated_at,
      (
        case when lower(listing.title) = input.query then 120 else 0 end
        + case when lower(listing.title) like input.query || '%' then 80 else 0 end
        + case when lower(listing.title) like '%' || input.query || '%' then 60 else 0 end
        + case when lower(coalesce(listing.sub_category, '')) like '%' || input.query || '%' then 35 else 0 end
        + case when lower(listing.city) like '%' || input.query || '%' then 30 else 0 end
        + case when lower(coalesce(listing.neighborhood, '')) like '%' || input.query || '%' then 25 else 0 end
        + case when lower(listing.description) like '%' || input.query || '%' then 15 else 0 end
        + extensions.word_similarity(input.query, lower(listing.title)) * 45
        + extensions.word_similarity(input.query, lower(coalesce(listing.sub_category, ''))) * 25
        + extensions.word_similarity(input.query, lower(listing.city)) * 20
      )::real as search_rank
    from public.listings as listing
    cross join search_input as input
    where listing.status = 'active'
      and char_length(input.query) between 2 and 100
      and (
        lower(concat_ws(
          ' ',
          listing.title,
          listing.description,
          listing.sub_category,
          listing.category_type::text,
          listing.city,
          listing.neighborhood
        )) like '%' || input.query || '%'
        or exists (
          select 1
          from unnest(regexp_split_to_array(input.query, '\s+')) as tokens(token)
          where char_length(token) >= 2
            and lower(concat_ws(
              ' ',
              listing.title,
              listing.description,
              listing.sub_category,
              listing.category_type::text,
              listing.city,
              listing.neighborhood
            )) like '%' || token || '%'
        )
        or extensions.word_similarity(input.query, lower(listing.title)) >= 0.35
        or extensions.word_similarity(input.query, lower(coalesce(listing.sub_category, ''))) >= 0.4
        or extensions.word_similarity(input.query, lower(listing.city)) >= 0.5
      )
  )
  select *
  from ranked
  order by search_rank desc, created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_marketplace_listings(text, integer, integer) from public;
grant execute on function public.search_marketplace_listings(text, integer, integer) to anon, authenticated;
