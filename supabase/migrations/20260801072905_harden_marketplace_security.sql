-- Harden the marketplace schema and make Data API exposure explicit.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$ begin
  create type public.user_role as enum ('user', 'seller', 'company', 'admin');
exception when duplicate_object then null;
end $$;

alter type public.listing_category add value if not exists 'services';
alter type public.listing_category add value if not exists 'boats';
alter type public.listing_category add value if not exists 'motorbikes';

alter table public.profiles
  add column if not exists role public.user_role not null default 'user';

alter table public.listings
  add column if not exists images jsonb not null default '[]'::jsonb;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_text text not null check (char_length(comment_text) between 1 and 2000),
  is_seller_reply boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.listings enable row level security;
alter table public.comments enable row level security;
alter table public.favorites enable row level security;
alter table public.chat_threads enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

-- A profile is created atomically with every Auth user. The function is kept
-- outside the exposed schema and is not callable through the Data API.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, phone_number)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'عضو جديد'),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Backfill users created before the trigger existed.
insert into public.profiles (id, full_name, avatar_url, phone_number)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1), 'عضو جديد'),
  nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
  nullif(u.raw_user_meta_data ->> 'phone', '')
from auth.users u
on conflict (id) do nothing;

-- Remove the legacy public SECURITY DEFINER endpoint flagged by the advisor.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Profiles are readable" on public.profiles
for select to authenticated using (true);
create policy "Users update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Categories are readable" on public.categories;
create policy "Categories are readable" on public.categories
for select to anon, authenticated using (true);

drop policy if exists "Active listings viewable by everyone" on public.listings;
drop policy if exists "Active listings are readable" on public.listings;
drop policy if exists "Owners and admins read listings" on public.listings;
drop policy if exists "Authenticated users can create listings" on public.listings;
drop policy if exists "Users can update own listings" on public.listings;
drop policy if exists "Users can delete own listings" on public.listings;
create policy "Active listings are readable" on public.listings
for select to anon, authenticated using (status = 'active');
create policy "Owners and admins read listings" on public.listings
for select to authenticated using ((select auth.uid()) = user_id or exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
));
create policy "Users create own listings" on public.listings
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Owners and admins update listings" on public.listings
for update to authenticated
using ((select auth.uid()) = user_id or exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
))
with check ((select auth.uid()) = user_id or exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
));
create policy "Owners and admins delete listings" on public.listings
for delete to authenticated
using ((select auth.uid()) = user_id or exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
));

drop policy if exists "Comments viewable by everyone" on public.comments;
drop policy if exists "Authenticated users can comment" on public.comments;
drop policy if exists "Users can delete own comment" on public.comments;
create policy "Comments are readable" on public.comments
for select to anon, authenticated using (true);
create policy "Users create own comments" on public.comments
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Authors owners and admins delete comments" on public.comments
for delete to authenticated using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.listings l where l.id = listing_id and l.user_id = (select auth.uid()))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists "Users view own favorites" on public.favorites;
drop policy if exists "Users manage own favorites" on public.favorites;
drop policy if exists "Users delete own favorites" on public.favorites;
create policy "Users read own favorites" on public.favorites
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own favorites" on public.favorites
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users delete own favorites" on public.favorites
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Participants read threads" on public.chat_threads;
drop policy if exists "Buyers create threads" on public.chat_threads;
drop policy if exists "Participants update threads" on public.chat_threads;
create policy "Participants read threads" on public.chat_threads
for select to authenticated
using ((select auth.uid()) in (buyer_id, seller_id));
create policy "Buyers create threads" on public.chat_threads
for insert to authenticated
with check ((select auth.uid()) = buyer_id and buyer_id <> seller_id);
create policy "Participants update threads" on public.chat_threads
for update to authenticated
using ((select auth.uid()) in (buyer_id, seller_id))
with check ((select auth.uid()) in (buyer_id, seller_id));

drop policy if exists "Participants read messages" on public.messages;
drop policy if exists "Participants send own messages" on public.messages;
drop policy if exists "Participants mark messages read" on public.messages;
create policy "Participants read messages" on public.messages
for select to authenticated using (exists (
  select 1 from public.chat_threads t
  where t.id = thread_id and (select auth.uid()) in (t.buyer_id, t.seller_id)
));
create policy "Participants send own messages" on public.messages
for insert to authenticated
with check ((select auth.uid()) = sender_id and exists (
  select 1 from public.chat_threads t
  where t.id = thread_id and (select auth.uid()) in (t.buyer_id, t.seller_id)
));
create policy "Participants mark messages read" on public.messages
for update to authenticated
using (exists (
  select 1 from public.chat_threads t
  where t.id = thread_id and (select auth.uid()) in (t.buyer_id, t.seller_id)
))
with check (exists (
  select 1 from public.chat_threads t
  where t.id = thread_id and (select auth.uid()) in (t.buyer_id, t.seller_id)
));

drop policy if exists "Authenticated users can report" on public.reports;
create policy "Users create own reports" on public.reports
for insert to authenticated with check ((select auth.uid()) = reporter_id);
create policy "Admins read reports" on public.reports
for select to authenticated using (exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
));
create policy "Admins update reports" on public.reports
for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

-- Explicit Data API grants (required by current Supabase defaults).
revoke all on public.profiles, public.categories, public.listings, public.comments,
  public.favorites, public.chat_threads, public.messages, public.reports
from anon, authenticated;
grant select on public.categories, public.listings, public.comments to anon;
grant select on public.profiles, public.categories, public.listings, public.comments to authenticated;
grant insert on public.listings, public.comments, public.favorites, public.chat_threads, public.messages, public.reports to authenticated;
grant select on public.favorites, public.chat_threads, public.messages, public.reports to authenticated;
grant delete on public.listings, public.comments, public.favorites to authenticated;
grant update (full_name, avatar_url, phone_number, city, updated_at) on public.profiles to authenticated;
grant update (title, description, price, is_free, category_type, sub_category, condition, city, neighborhood, status, attributes, images, updated_at) on public.listings to authenticated;
grant update (last_message, updated_at) on public.chat_threads to authenticated;
grant update (is_read) on public.messages to authenticated;
grant update (status) on public.reports to authenticated;

create index if not exists idx_listings_user_id on public.listings(user_id);
create index if not exists idx_listings_status_created on public.listings(status, created_at desc);
create index if not exists idx_comments_user_id on public.comments(user_id);
create index if not exists idx_favorites_user_id on public.favorites(user_id);
create index if not exists idx_favorites_listing_id on public.favorites(listing_id);
create index if not exists idx_chat_threads_buyer_id on public.chat_threads(buyer_id);
create index if not exists idx_chat_threads_seller_id on public.chat_threads(seller_id);
create index if not exists idx_messages_thread_id on public.messages(thread_id);
create index if not exists idx_reports_reporter_id on public.reports(reporter_id);

-- Keep extension objects out of the exposed schema where supported.
create schema if not exists extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;
alter extension pg_trgm set schema extensions;
