-- Professional reputation and trust workflows. This migration keeps all
-- historical ratings/reports while moving writes behind atomic RPCs.

alter table public.seller_ratings
  add column if not exists review_text text,
  add column if not exists seller_reply text,
  add column if not exists seller_replied_at timestamptz,
  add column if not exists is_current boolean not null default true,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null;

alter table public.seller_ratings
  drop constraint if exists seller_ratings_one_per_listing,
  drop constraint if exists seller_ratings_review_length,
  drop constraint if exists seller_ratings_reply_length;
alter table public.seller_ratings
  add constraint seller_ratings_review_length
    check (review_text is null or char_length(btrim(review_text)) between 3 and 1000) not valid,
  add constraint seller_ratings_reply_length
    check (seller_reply is null or char_length(btrim(seller_reply)) between 2 and 1000) not valid;

-- Retain older per-listing ratings as history and choose the newest rating as
-- the current seller/reviewer opinion.
with ranked as (
  select id, row_number() over (
    partition by seller_id, reviewer_id order by updated_at desc, created_at desc, id desc
  ) as position
  from public.seller_ratings
)
update public.seller_ratings r
set is_current = (ranked.position = 1)
from ranked where ranked.id = r.id;

create unique index if not exists seller_ratings_one_current_per_pair
  on public.seller_ratings(seller_id, reviewer_id) where is_current;
create index if not exists seller_ratings_public_history_idx
  on public.seller_ratings(seller_id, created_at desc, id desc)
  where is_current and hidden_at is null;

create or replace function private.valid_https_evidence(p_urls jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_urls) <> 'array' then false else
    jsonb_array_length(p_urls) <= 3
      and not exists (
        select 1 from jsonb_array_elements(p_urls) item
        where jsonb_typeof(item) <> 'string'
           or char_length(item #>> '{}') > 500
           or (item #>> '{}') !~ '^https://.+'
      ) end;
$$;
revoke all on function private.valid_https_evidence(jsonb) from public, anon, authenticated;

alter table public.reports
  add column if not exists rating_id uuid references public.seller_ratings(id) on delete set null,
  add column if not exists target_type text,
  add column if not exists category text,
  add column if not exists details text,
  add column if not exists evidence_urls jsonb not null default '[]'::jsonb,
  add column if not exists priority smallint not null default 1,
  add column if not exists subject_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.reports set category = coalesce(category,'other'), target_type = coalesce(target_type,'listing'),
  details = coalesce(details,nullif(btrim(reason), ''));
-- The original status CHECK was created inline and its generated name can vary
-- between bootstrapped and migrated environments. Remove only CHECK constraints
-- that reference the status column before introducing the new workflow value.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.reports'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.reports drop constraint %I', constraint_name);
  end loop;
end $$;
update public.reports set status = 'in_review' where status = 'reviewed';
-- Old rules allowed one pending and one reviewed report for the same target.
-- Preserve those rows but close every older duplicate before the new open-case
-- uniqueness rule is installed.
with duplicate_open as (
  select id, row_number() over (
    partition by reporter_id, listing_id order by created_at desc, id desc
  ) as position
  from public.reports
  where listing_id is not null and status in ('pending','in_review')
)
update public.reports r set status='dismissed', reviewed_at=coalesce(reviewed_at,now()),
  resolution_note=coalesce(resolution_note,'أُغلق تلقائيًا عند ترقية النظام لوجود بلاغ أحدث مفتوح.')
from duplicate_open d where d.id=r.id and d.position>1;
alter table public.reports alter column category set not null;
alter table public.reports alter column target_type set not null;

alter table public.reports
  drop constraint if exists reports_status_valid,
  drop constraint if exists reports_category_valid,
  drop constraint if exists reports_target_valid,
  drop constraint if exists reports_target_type_valid,
  drop constraint if exists reports_details_length,
  drop constraint if exists reports_evidence_valid,
  drop constraint if exists reports_priority_valid;
alter table public.reports
  add constraint reports_status_valid check (status in ('pending','in_review','resolved','dismissed')),
  add constraint reports_category_valid check (category in (
    'fraud','prohibited','misleading','duplicate','abuse','spam','privacy','other'
  )),
  -- Targets may become null later through ON DELETE SET NULL; report creation
  -- itself still requires exactly one target inside submit_trust_report().
  add constraint reports_target_valid check (num_nonnulls(listing_id, rating_id) <= 1),
  add constraint reports_target_type_valid check (
    (target_type = 'listing' and rating_id is null)
    or (target_type = 'rating' and listing_id is null)
  ),
  add constraint reports_details_length check (
    details is null or char_length(btrim(details)) between 5 and 2000
  ),
  add constraint reports_evidence_valid check (
    private.valid_https_evidence(evidence_urls)
  ),
  add constraint reports_priority_valid check (priority between 1 and 3);

drop index if exists public.uq_pending_report_per_user_listing;
create unique index if not exists reports_one_open_listing_per_reporter
  on public.reports(reporter_id, listing_id)
  where listing_id is not null and status in ('pending','in_review');
create unique index if not exists reports_one_open_rating_per_reporter
  on public.reports(reporter_id, rating_id)
  where rating_id is not null and status in ('pending','in_review');
create index if not exists reports_moderation_queue_idx
  on public.reports(status, priority desc, created_at asc, id);
create index if not exists reports_subject_user_idx
  on public.reports(subject_user_id, created_at desc);

create table if not exists public.trust_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('report_received','report_resolved','rating_reply')),
  title text not null check (char_length(title) between 2 and 120),
  message text not null check (char_length(message) between 2 and 500),
  related_report_id uuid references public.reports(id) on delete set null,
  related_rating_id uuid references public.seller_ratings(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.trust_notifications enable row level security;
revoke all on public.trust_notifications from public, anon, authenticated;
grant select (id, kind, title, message, related_report_id, related_rating_id, read_at, created_at)
  on public.trust_notifications to authenticated;
grant update (read_at) on public.trust_notifications to authenticated;
create policy "Users read own trust notifications" on public.trust_notifications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users mark own trust notifications read" on public.trust_notifications
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index if not exists trust_notifications_user_unread_idx
  on public.trust_notifications(user_id, created_at desc) where read_at is null;

create table if not exists public.trust_action_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('rating.write','report.create')),
  target_id uuid,
  created_at timestamptz not null default now()
);
alter table public.trust_action_log enable row level security;
revoke all on public.trust_action_log from public, anon, authenticated;
create index if not exists trust_action_rate_limit_idx
  on public.trust_action_log(user_id, action, created_at desc);

-- Public rating reads expose only content intended for the seller reputation UI.
revoke all on public.seller_ratings from anon, authenticated;
grant select (id, seller_id, reviewer_id, rating, review_text, seller_reply,
              seller_replied_at, created_at, updated_at, is_current, hidden_at)
  on public.seller_ratings to anon, authenticated;
drop policy if exists "Ratings are readable" on public.seller_ratings;
create policy "Current ratings are publicly readable" on public.seller_ratings
  for select to anon, authenticated using (is_current and hidden_at is null);
drop policy if exists "Users rate listing sellers" on public.seller_ratings;
drop policy if exists "Users update own ratings" on public.seller_ratings;
drop policy if exists "Users delete own ratings" on public.seller_ratings;
revoke insert, update, delete on public.seller_ratings from authenticated;

create or replace function private.refresh_seller_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_seller uuid;
begin
  target_seller := case when tg_op = 'DELETE' then old.seller_id else new.seller_id end;
  update public.profiles p set rating = (
    select round(avg(r.rating)::numeric, 1) from public.seller_ratings r
    where r.seller_id = target_seller and r.is_current and r.hidden_at is null
  ), updated_at = now() where p.id = target_seller;
  return null;
end;
$$;
revoke all on function private.refresh_seller_rating() from public, anon, authenticated;

drop function if exists public.upsert_seller_rating(uuid, uuid, smallint);
create function public.upsert_seller_rating(
  p_listing_id uuid, p_seller_id uuid, p_rating smallint, p_review_text text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_review text := nullif(btrim(coalesce(p_review_text, '')), '');
  existing_id uuid;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if caller_id = p_seller_id then raise exception 'Self-rating is not allowed' using errcode = '23514'; end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;
  if normalized_review is not null and char_length(normalized_review) not between 3 and 1000 then
    raise exception 'Review must be between 3 and 1000 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.listings l where l.id = p_listing_id and l.user_id = p_seller_id) then
    raise exception 'Listing and seller do not match' using errcode = '23503';
  end if;
  -- A created thread is insufficient: require an actual message or comment.
  if not exists (
    select 1 from public.comments c join public.listings l on l.id = c.listing_id
    where c.user_id = caller_id and l.user_id = p_seller_id
    union all
    select 1 from public.messages m join public.chat_threads t on t.id = m.thread_id
    where m.sender_id = caller_id and t.seller_id = p_seller_id
  ) then
    raise exception 'A real interaction with this seller is required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_id::text || ':rating.write',0));
  if (select count(*) from public.trust_action_log a
      where a.user_id = caller_id and a.action = 'rating.write'
        and a.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Rating rate limit exceeded' using errcode = '42900';
  end if;
  select id into existing_id from public.seller_ratings
  where seller_id = p_seller_id and reviewer_id = caller_id and is_current for update;
  if existing_id is not null then
    update public.seller_ratings set is_current = false, updated_at = now()
    where id = existing_id;
  end if;
  insert into public.seller_ratings(listing_id, seller_id, reviewer_id, rating, review_text)
  values (p_listing_id, p_seller_id, caller_id, p_rating, normalized_review)
  returning id into existing_id;
  insert into public.trust_action_log(user_id, action, target_id)
    values (caller_id, 'rating.write', existing_id);
  return existing_id;
end;
$$;

create or replace function public.reply_to_seller_rating(p_rating_id uuid, p_reply text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); normalized_reply text := nullif(btrim(coalesce(p_reply,'')), ''); reviewer uuid;
begin
  if normalized_reply is null or char_length(normalized_reply) not between 2 and 1000 then
    raise exception 'Reply must be between 2 and 1000 characters' using errcode = '22023';
  end if;
  update public.seller_ratings set seller_reply = normalized_reply, seller_replied_at = now(), updated_at = now()
  where id = p_rating_id and seller_id = caller_id and is_current and hidden_at is null
  returning reviewer_id into reviewer;
  if reviewer is null then raise exception 'Rating not found or not owned by seller' using errcode = '42501'; end if;
  insert into public.trust_notifications(user_id, kind, title, message, related_rating_id)
  values (reviewer, 'rating_reply', 'رد المعلن على تقييمك', 'أضاف المعلن ردًا على تقييمك.', p_rating_id);
end;
$$;

create or replace function public.get_seller_rating_summary(p_seller_id uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; safe_limit integer := least(greatest(coalesce(p_limit,20),1),50);
begin
  with visible as (
    select r.id, r.rating, r.review_text, r.seller_reply, r.seller_replied_at,
           r.created_at, r.updated_at, coalesce(p.full_name,'عضو') reviewer_name
    from public.seller_ratings r left join public.profiles p on p.id = r.reviewer_id
    where r.seller_id = p_seller_id and r.is_current and r.hidden_at is null
  ), recent as (select * from visible order by created_at desc, id desc limit safe_limit)
  select jsonb_build_object(
    'average', coalesce((select round(avg(rating)::numeric,1) from visible),0),
    'count', (select count(*) from visible),
    'distribution', jsonb_build_object(
      '1',(select count(*) from visible where rating=1),'2',(select count(*) from visible where rating=2),
      '3',(select count(*) from visible where rating=3),'4',(select count(*) from visible where rating=4),
      '5',(select count(*) from visible where rating=5)),
    'reviews', coalesce((select jsonb_agg(to_jsonb(recent) order by created_at desc, id desc) from recent),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.submit_trust_report(
  p_listing_id uuid default null, p_rating_id uuid default null, p_category text default 'other',
  p_details text default null, p_evidence_urls jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid()); report_id uuid; subject_id uuid;
  normalized_details text := nullif(btrim(coalesce(p_details,'')), ''); computed_priority smallint := 1;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if num_nonnulls(p_listing_id,p_rating_id) <> 1 then raise exception 'Exactly one report target is required' using errcode='22023'; end if;
  if p_category not in ('fraud','prohibited','misleading','duplicate','abuse','spam','privacy','other') then
    raise exception 'Invalid report category' using errcode='22023';
  end if;
  if normalized_details is not null and char_length(normalized_details) not between 5 and 2000 then
    raise exception 'Report details must be empty or between 5 and 2000 characters' using errcode='22023';
  end if;
  if not private.valid_https_evidence(p_evidence_urls) then
    raise exception 'Evidence must contain up to 3 HTTPS URLs' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_id::text || ':report.create',0));
  if (select count(*) from public.reports where reporter_id=caller_id and created_at > now()-interval '24 hours') >= 5 then
    raise exception 'Report rate limit exceeded' using errcode='42900';
  end if;
  if p_listing_id is not null then
    select user_id into subject_id from public.listings where id=p_listing_id;
  else
    select reviewer_id into subject_id from public.seller_ratings
      where id=p_rating_id and is_current and hidden_at is null;
  end if;
  if subject_id is null then raise exception 'Report target not found' using errcode='P0002'; end if;
  if subject_id = caller_id then raise exception 'Self-reporting is not allowed' using errcode='23514'; end if;
  computed_priority := case when p_category in ('fraud','prohibited','privacy') then 3
                            when p_category in ('misleading','abuse') then 2 else 1 end;
  if (select count(*) from public.reports r where
        (p_listing_id is not null and r.listing_id=p_listing_id)
        or (p_rating_id is not null and r.rating_id=p_rating_id)) >= 2 then
    computed_priority := least(3, computed_priority + 1);
  end if;
  insert into public.reports(listing_id,rating_id,target_type,reporter_id,reason,category,details,evidence_urls,priority,subject_user_id)
  values (p_listing_id,p_rating_id,case when p_listing_id is not null then 'listing' else 'rating' end,
          caller_id,coalesce(normalized_details,p_category),p_category,normalized_details,p_evidence_urls,computed_priority,subject_id)
  returning id into report_id;
  insert into public.trust_notifications(user_id,kind,title,message,related_report_id)
  values (caller_id,'report_received','تم استلام البلاغ','وصل البلاغ للمراجعة دون مشاركة هويتك مع الطرف الآخر.',report_id);
  insert into public.trust_action_log(user_id,action,target_id)
    values (caller_id,'report.create',report_id);
  return report_id;
exception when unique_violation then
  raise exception 'An open report already exists for this target' using errcode='23505';
end;
$$;

drop function if exists public.get_admin_reports_page(integer,integer,text);
create function public.get_admin_reports_page(
  p_page integer default 0, p_page_size integer default 25, p_status text default null,
  p_target_type text default null, p_category text default null, p_priority smallint default null,
  p_search text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare safe_page integer:=greatest(coalesce(p_page,0),0); safe_size integer:=least(greatest(coalesce(p_page_size,25),1),100); query_text text:=nullif(btrim(coalesce(p_search,'')),''); result jsonb;
begin
  perform public.require_marketplace_admin();
  if p_status is not null and p_status not in ('pending','in_review','resolved','dismissed') then raise exception 'Invalid status' using errcode='22023'; end if;
  if p_target_type is not null and p_target_type not in ('listing','rating') then raise exception 'Invalid target type' using errcode='22023'; end if;
  with filtered as (
    select r.id,r.listing_id,r.rating_id,r.target_type,
      coalesce(l.title,'تقييم المعلن') target_title, coalesce(p.full_name,'عضو') reporter_name,
      r.category,r.details,r.evidence_urls,r.priority,r.status,r.created_at,r.reviewed_at,r.resolution_note
    from public.reports r left join public.listings l on l.id=r.listing_id left join public.profiles p on p.id=r.reporter_id
    where (p_status is null or r.status=p_status) and (p_target_type is null or (p_target_type='listing' and r.listing_id is not null) or (p_target_type='rating' and r.rating_id is not null))
      and (p_category is null or r.category=p_category) and (p_priority is null or r.priority=p_priority)
      and (query_text is null or coalesce(l.title,'') ilike '%'||query_text||'%' or coalesce(r.details,'') ilike '%'||query_text||'%')
  ), page_rows as (select * from filtered order by priority desc,created_at asc,id limit safe_size offset safe_page*safe_size)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by priority desc,created_at asc,id) from page_rows p),'[]'::jsonb),'total',(select count(*) from filtered),'page',safe_page,'page_size',safe_size) into result;
  return result;
end;
$$;

drop function if exists public.admin_update_report(uuid,text,text,text);
create function public.admin_update_report(
  p_report_id uuid,p_expected_status text,p_status text,p_resolution_note text default null,p_hide_content boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare caller_id uuid:=public.require_marketplace_admin(); note text:=nullif(btrim(coalesce(p_resolution_note,'')),''); changed public.reports%rowtype;
begin
  if not ((p_expected_status='pending' and p_status in ('in_review','dismissed')) or (p_expected_status='in_review' and p_status in ('resolved','dismissed'))) then
    raise exception 'Invalid report transition' using errcode='22023';
  end if;
  if p_status in ('resolved','dismissed') and (note is null or char_length(note)<3) then raise exception 'A resolution note is required' using errcode='22023'; end if;
  if note is not null and char_length(note)>1000 then raise exception 'Resolution note is too long' using errcode='22001'; end if;
  update public.reports set status=p_status,reviewed_by=caller_id,reviewed_at=now(),resolution_note=note,updated_at=now()
    where id=p_report_id and status=p_expected_status returning * into changed;
  if changed.id is null then raise exception 'Report changed; refresh and retry' using errcode='40001'; end if;
  if p_hide_content and p_status='resolved' and changed.rating_id is not null then
    update public.seller_ratings set hidden_at=now(),hidden_by=caller_id,updated_at=now() where id=changed.rating_id;
  end if;
  insert into public.admin_audit_log(admin_id,action,target_type,target_id,metadata)
    values(caller_id,'report.status_changed','report',p_report_id::text,jsonb_build_object('from',p_expected_status,'to',p_status,'note',note,'content_hidden',p_hide_content));
  insert into public.trust_notifications(user_id,kind,title,message,related_report_id)
    values(changed.reporter_id,'report_resolved','تحديث حالة البلاغ',case when p_status='resolved' then 'تمت معالجة البلاغ.' when p_status='dismissed' then 'اكتملت مراجعة البلاغ ولم تثبت المخالفة.' else 'بدأ فريق الإشراف مراجعة البلاغ.' end,p_report_id);
  if p_status in ('resolved','dismissed') and changed.subject_user_id is not null then
    insert into public.trust_notifications(user_id,kind,title,message,related_report_id)
      values(changed.subject_user_id,'report_resolved','نتيجة مراجعة المحتوى',case when p_status='resolved' then 'راجع فريق الإشراف محتوى مرتبطًا بحسابك واتخذ الإجراء المناسب.' else 'اكتملت مراجعة محتوى مرتبط بحسابك.' end,p_report_id);
  end if;
end;
$$;

revoke all on function public.upsert_seller_rating(uuid,uuid,smallint,text) from public,anon,authenticated;
revoke all on function public.reply_to_seller_rating(uuid,text) from public,anon,authenticated;
revoke all on function public.get_seller_rating_summary(uuid,integer) from public,anon,authenticated;
revoke all on function public.submit_trust_report(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.get_admin_reports_page(integer,integer,text,text,text,smallint,text) from public,anon,authenticated;
revoke all on function public.admin_update_report(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.upsert_seller_rating(uuid,uuid,smallint,text) to authenticated;
grant execute on function public.reply_to_seller_rating(uuid,text) to authenticated;
grant execute on function public.get_seller_rating_summary(uuid,integer) to anon,authenticated;
grant execute on function public.submit_trust_report(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.get_admin_reports_page(integer,integer,text,text,text,smallint,text) to authenticated;
grant execute on function public.admin_update_report(uuid,text,text,text,boolean) to authenticated;

create or replace function public.get_admin_dashboard_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_marketplace_admin();
  return jsonb_build_object(
    'listings',(select count(*) from public.listings),
    'users',(select count(*) from public.profiles),
    'verified',(select count(*) from public.profiles where verified_seller),
    'pending_reports',(select count(*) from public.reports where status in ('pending','in_review')),
    'open_deletions',(select count(*) from public.account_deletion_requests where status in ('pending','processing','failed'))
  );
end;
$$;
revoke all on function public.get_admin_dashboard_summary() from public,anon,authenticated;
grant execute on function public.get_admin_dashboard_summary() to authenticated;

update public.profiles p set rating = (
  select round(avg(r.rating)::numeric,1) from public.seller_ratings r
  where r.seller_id=p.id and r.is_current and r.hidden_at is null
), updated_at=now()
where exists (select 1 from public.seller_ratings r where r.seller_id=p.id);

-- Reports are written only through submit_trust_report, which supplies all
-- protected fields and performs abuse checks atomically.
drop policy if exists "Users create own reports" on public.reports;
drop policy if exists "Authenticated users can report" on public.reports;
revoke insert,update,delete on public.reports from authenticated;
