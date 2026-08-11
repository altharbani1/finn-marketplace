-- Harden the administrator control plane: paginated reads, optimistic writes,
-- an immutable audit trail, and an atomic account-deletion worker claim.

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_action_length check (char_length(action) between 3 and 80),
  constraint admin_audit_target_length check (char_length(target_type) between 2 and 60)
);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public, anon, authenticated;

alter table public.reports
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolution_note text;

alter table public.account_deletion_requests
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_by uuid references public.profiles(id) on delete set null,
  add column if not exists failure_reason text;

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_status_valid;
alter table public.account_deletion_requests
  add constraint account_deletion_status_valid
  check (status in ('pending', 'processing', 'completed', 'cancelled', 'failed'));

create index if not exists admin_audit_created_idx
  on public.admin_audit_log(created_at desc, id desc);
create index if not exists listings_admin_page_idx
  on public.listings(created_at desc, id desc);
create index if not exists profiles_admin_page_idx
  on public.profiles(created_at desc, id desc);
create index if not exists reports_admin_page_idx
  on public.reports(status, created_at desc, id desc);
create index if not exists account_deletions_admin_page_idx
  on public.account_deletion_requests(status, requested_at desc, id desc);

create or replace function public.require_marketplace_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not exists (
    select 1 from public.profiles p where p.id = caller_id and p.role = 'admin'
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return caller_id;
end;
$$;
revoke all on function public.require_marketplace_admin() from public, anon, authenticated;

create or replace function public.get_admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_marketplace_admin();
  return jsonb_build_object(
    'listings', (select count(*) from public.listings),
    'users', (select count(*) from public.profiles),
    'verified', (select count(*) from public.profiles where verified_seller),
    'pending_reports', (select count(*) from public.reports where status = 'pending'),
    'open_deletions', (select count(*) from public.account_deletion_requests where status in ('pending','processing','failed'))
  );
end;
$$;

create or replace function public.get_admin_listings_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 0), 0);
  safe_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  normalized_search text := nullif(btrim(coalesce(p_search, '')), '');
  result jsonb;
begin
  perform public.require_marketplace_admin();
  if p_status is not null and p_status not in ('active','pending','rejected','reserved','sold') then
    raise exception 'Invalid listing status' using errcode = '22023';
  end if;
  with filtered as (
    select l.id, l.title, l.price, l.is_free, l.category_type, l.sub_category,
           l.city, l.status, l.created_at
    from public.listings l
    where (p_status is null or l.status::text = p_status)
      and (normalized_search is null or l.title ilike '%' || normalized_search || '%'
           or l.city ilike '%' || normalized_search || '%'
           or coalesce(l.sub_category, '') ilike '%' || normalized_search || '%')
  ), page_rows as (
    select * from filtered order by created_at desc, id desc
    limit safe_size offset safe_page * safe_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from page_rows p), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', safe_page, 'page_size', safe_size
  ) into result;
  return result;
end;
$$;

create or replace function public.get_admin_profiles_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 0), 0);
  safe_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  normalized_search text := nullif(btrim(coalesce(p_search, '')), '');
  result jsonb;
begin
  perform public.require_marketplace_admin();
  with filtered as (
    select p.id, p.full_name, p.phone_number, p.role, p.verified_seller, p.created_at, p.updated_at
    from public.profiles p
    where normalized_search is null or p.full_name ilike '%' || normalized_search || '%'
      or coalesce(p.phone_number, '') ilike '%' || normalized_search || '%'
  ), page_rows as (
    select * from filtered order by created_at desc, id desc
    limit safe_size offset safe_page * safe_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from page_rows p), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', safe_page, 'page_size', safe_size
  ) into result;
  return result;
end;
$$;

create or replace function public.get_admin_reports_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 0), 0);
  safe_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  result jsonb;
begin
  perform public.require_marketplace_admin();
  if p_status is not null and p_status not in ('pending','reviewed','resolved','dismissed') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;
  with filtered as (
    select r.id, r.listing_id, coalesce(l.title, 'إعلان غير متاح') as listing_title,
           coalesce(p.full_name, 'عضو') as reporter_name, r.reason, r.status,
           r.created_at, r.reviewed_at, r.resolution_note
    from public.reports r
    left join public.listings l on l.id = r.listing_id
    left join public.profiles p on p.id = r.reporter_id
    where p_status is null or r.status = p_status
  ), page_rows as (
    select * from filtered order by created_at desc, id desc
    limit safe_size offset safe_page * safe_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from page_rows p), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', safe_page, 'page_size', safe_size
  ) into result;
  return result;
end;
$$;

create or replace function public.get_admin_deletion_requests_page(
  p_page integer default 0,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 0), 0);
  safe_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  result jsonb;
begin
  perform public.require_marketplace_admin();
  with rows_with_email as (
    select r.id, r.user_id, u.email::text, r.reason, r.status, r.requested_at,
           r.reviewed_at, r.failure_reason
    from public.account_deletion_requests r
    left join auth.users u on u.id = r.user_id
  ), page_rows as (
    select * from rows_with_email order by requested_at desc, id desc
    limit safe_size offset safe_page * safe_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.requested_at desc, p.id desc) from page_rows p), '[]'::jsonb),
    'total', (select count(*) from rows_with_email), 'page', safe_page, 'page_size', safe_size
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_update_profile(
  p_user_id uuid,
  p_role public.user_role,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_marketplace_admin();
  previous_role public.user_role;
  previous_verified boolean;
begin
  select role, verified_seller into previous_role, previous_verified
  from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  if p_user_id = caller_id and p_role <> previous_role then
    raise exception 'You cannot change your own administrator role' using errcode = '42501';
  end if;
  if previous_role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The last administrator cannot be demoted' using errcode = '23514';
  end if;
  update public.profiles set role = p_role, verified_seller = p_verified, updated_at = now()
  where id = p_user_id;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, metadata)
  values (caller_id, 'profile.update_permissions', 'profile', p_user_id::text,
          jsonb_build_object('previous_role', previous_role, 'role', p_role,
                             'previous_verified', previous_verified, 'verified', p_verified));
end;
$$;

create or replace function public.admin_update_report(
  p_report_id uuid,
  p_expected_status text,
  p_status text,
  p_resolution_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_marketplace_admin();
  changed_count integer;
  note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
begin
  if p_status not in ('reviewed','resolved','dismissed') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;
  if not ((p_expected_status = 'pending' and p_status in ('reviewed','dismissed'))
      or (p_expected_status = 'reviewed' and p_status in ('resolved','dismissed'))) then
    raise exception 'Invalid report transition' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 1000 then
    raise exception 'Resolution note is too long' using errcode = '22001';
  end if;
  update public.reports set status = p_status, reviewed_by = caller_id,
    reviewed_at = now(), resolution_note = note
  where id = p_report_id and status = p_expected_status;
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'Report changed by another administrator; refresh and retry' using errcode = '40001';
  end if;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, metadata)
  values (caller_id, 'report.status_changed', 'report', p_report_id::text,
          jsonb_build_object('from', p_expected_status, 'to', p_status, 'note', note));
end;
$$;

create or replace function public.set_listing_status(
  p_listing_id uuid,
  p_status public.listing_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_marketplace_admin();
  previous_status public.listing_status;
begin
  select status into previous_status from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  update public.listings set status = p_status, updated_at = now() where id = p_listing_id;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, metadata)
  values (caller_id, 'listing.status_changed', 'listing', p_listing_id::text,
          jsonb_build_object('from', previous_status, 'to', p_status));
end;
$$;

create or replace function public.delete_listing_as_admin(p_listing_id uuid)
returns table (owner_id uuid, images jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_marketplace_admin();
  deleted_owner uuid;
  deleted_images jsonb;
begin
  delete from public.listings l where l.id = p_listing_id
  returning l.user_id, l.images into deleted_owner, deleted_images;
  if not found then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, metadata)
  values (caller_id, 'listing.deleted', 'listing', p_listing_id::text,
          jsonb_build_object('owner_id', deleted_owner));
  return query select deleted_owner, deleted_images;
end;
$$;

create or replace function public.claim_account_deletion_request(
  p_request_id uuid,
  p_admin_id uuid
)
returns table (request_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.role = 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
  update public.account_deletion_requests r
  set status = 'processing', processing_started_at = now(), processing_by = p_admin_id,
      reviewed_at = now(), failure_reason = null
  where r.id = p_request_id and r.user_id is not null and r.status in ('pending','failed')
  returning r.id, r.user_id;
end;
$$;

create or replace function public.complete_account_deletion_request(p_request_id uuid, p_admin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed_count integer;
begin
  update public.account_deletion_requests
  set status = 'completed', reviewed_at = now(), failure_reason = null
  where id = p_request_id and status = 'processing' and processing_by = p_admin_id;
  get diagnostics changed_count = row_count;
  if changed_count = 1 then
    insert into public.admin_audit_log(admin_id, action, target_type, target_id)
    values (p_admin_id, 'account.deletion_completed', 'account_deletion_request', p_request_id::text);
  end if;
  return changed_count = 1;
end;
$$;

create or replace function public.fail_account_deletion_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_failure_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed_count integer;
begin
  update public.account_deletion_requests
  set status = 'failed', reviewed_at = now(), failure_reason = left(coalesce(p_failure_reason, 'Unknown failure'), 1000)
  where id = p_request_id and status = 'processing' and processing_by = p_admin_id;
  get diagnostics changed_count = row_count;
  if changed_count = 1 then
    insert into public.admin_audit_log(admin_id, action, target_type, target_id, metadata)
    values (p_admin_id, 'account.deletion_failed', 'account_deletion_request', p_request_id::text,
            jsonb_build_object('reason', left(coalesce(p_failure_reason, 'Unknown failure'), 1000)));
  end if;
  return changed_count = 1;
end;
$$;

revoke all on function public.get_admin_dashboard_summary() from public, anon, authenticated;
revoke all on function public.get_admin_listings_page(integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.get_admin_profiles_page(integer, integer, text) from public, anon, authenticated;
revoke all on function public.get_admin_reports_page(integer, integer, text) from public, anon, authenticated;
revoke all on function public.get_admin_deletion_requests_page(integer, integer) from public, anon, authenticated;
revoke all on function public.admin_update_profile(uuid, public.user_role, boolean) from public, anon, authenticated;
revoke all on function public.admin_update_report(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_account_deletion_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_account_deletion_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_account_deletion_request(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.get_admin_dashboard_summary() to authenticated;
grant execute on function public.get_admin_listings_page(integer, integer, text, text) to authenticated;
grant execute on function public.get_admin_profiles_page(integer, integer, text) to authenticated;
grant execute on function public.get_admin_reports_page(integer, integer, text) to authenticated;
grant execute on function public.get_admin_deletion_requests_page(integer, integer) to authenticated;
grant execute on function public.admin_update_profile(uuid, public.user_role, boolean) to authenticated;
grant execute on function public.admin_update_report(uuid, text, text, text) to authenticated;
grant execute on function public.claim_account_deletion_request(uuid, uuid) to service_role;
grant execute on function public.complete_account_deletion_request(uuid, uuid) to service_role;
grant execute on function public.fail_account_deletion_request(uuid, uuid, text) to service_role;
