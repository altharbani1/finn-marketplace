-- Enable production chat, seller ratings, and report moderation.

alter table public.chat_threads
  drop constraint if exists chat_threads_distinct_participants,
  add constraint chat_threads_distinct_participants check (buyer_id <> seller_id);

create unique index if not exists uq_chat_threads_listing_participants
  on public.chat_threads(listing_id, buyer_id, seller_id);
create index if not exists idx_chat_threads_participant_updated
  on public.chat_threads(buyer_id, seller_id, updated_at desc);

alter table public.messages
  drop constraint if exists messages_text_length,
  add constraint messages_text_length check (char_length(trim(message_text)) between 1 and 2000);
create index if not exists idx_messages_thread_created
  on public.messages(thread_id, created_at);

create or replace function private.refresh_chat_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_threads
  set last_message = new.message_text, updated_at = new.created_at
  where id = new.thread_id;
  return new;
end;
$$;

revoke all on function private.refresh_chat_thread() from public, anon, authenticated;
drop trigger if exists refresh_chat_thread_after_message on public.messages;
create trigger refresh_chat_thread_after_message
after insert on public.messages
for each row execute function private.refresh_chat_thread();

drop policy if exists "Buyers create threads" on public.chat_threads;
create policy "Buyers create listing threads" on public.chat_threads
for insert to authenticated
with check (
  (select auth.uid()) = buyer_id
  and buyer_id <> seller_id
  and exists (
    select 1 from public.listings l
    where l.id = listing_id and l.user_id = seller_id and l.status = 'active'
  )
);

create table if not exists public.seller_ratings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_ratings_no_self_rating check (seller_id <> reviewer_id),
  constraint seller_ratings_one_per_listing unique (listing_id, reviewer_id)
);

alter table public.seller_ratings enable row level security;

create policy "Ratings are readable" on public.seller_ratings
for select to anon, authenticated using (true);
create policy "Users rate listing sellers" on public.seller_ratings
for insert to authenticated
with check (
  (select auth.uid()) = reviewer_id
  and reviewer_id <> seller_id
  and exists (
    select 1 from public.listings l
    where l.id = listing_id and l.user_id = seller_id and l.status = 'active'
  )
);
create policy "Users update own ratings" on public.seller_ratings
for update to authenticated
using ((select auth.uid()) = reviewer_id)
with check ((select auth.uid()) = reviewer_id and reviewer_id <> seller_id);
create policy "Users delete own ratings" on public.seller_ratings
for delete to authenticated using ((select auth.uid()) = reviewer_id);

revoke all on public.seller_ratings from anon, authenticated;
grant select (seller_id, rating, created_at) on public.seller_ratings to anon, authenticated;
grant select (listing_id) on public.seller_ratings to authenticated;
grant insert (listing_id, seller_id, reviewer_id, rating) on public.seller_ratings to authenticated;
grant update (rating, updated_at) on public.seller_ratings to authenticated;
grant delete on public.seller_ratings to authenticated;

create index if not exists idx_seller_ratings_seller
  on public.seller_ratings(seller_id, created_at desc);

create or replace function private.refresh_seller_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_seller uuid;
begin
  target_seller := case when tg_op = 'DELETE' then old.seller_id else new.seller_id end;
  update public.profiles p
  set rating = (
    select round(avg(r.rating)::numeric, 1)
    from public.seller_ratings r
    where r.seller_id = target_seller
  ), updated_at = now()
  where p.id = target_seller;
  return null;
end;
$$;

revoke all on function private.refresh_seller_rating() from public, anon, authenticated;
drop trigger if exists refresh_seller_rating_after_change on public.seller_ratings;
create trigger refresh_seller_rating_after_change
after insert or update or delete on public.seller_ratings
for each row execute function private.refresh_seller_rating();

alter table public.profiles alter column rating drop default;
update public.profiles p
set rating = null
where not exists (select 1 from public.seller_ratings r where r.seller_id = p.id);

create unique index if not exists uq_pending_report_per_user_listing
  on public.reports(listing_id, reporter_id)
  where status = 'pending';
create index if not exists idx_reports_status_created
  on public.reports(status, created_at desc);

drop policy if exists "Users create own reports" on public.reports;
create policy "Users create own reports" on public.reports
for insert to authenticated
with check (
  (select auth.uid()) = reporter_id
  and listing_id is not null
  and exists (
    select 1 from public.listings l
    where l.id = listing_id and l.user_id <> (select auth.uid())
  )
);
