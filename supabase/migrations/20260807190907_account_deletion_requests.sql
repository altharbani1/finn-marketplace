-- Privacy-safe account deletion workflow. Authentication users are deleted only
-- by an administrator/server process because Supabase Admin deleteUser requires
-- the service role and must never be exposed to the browser.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  reason text,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint account_deletion_reason_length
    check (reason is null or char_length(reason) <= 1000),
  constraint account_deletion_status_valid
    check (status in ('pending', 'processing', 'completed', 'cancelled'))
);

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;

create unique index if not exists account_deletion_one_pending_per_user
on public.account_deletion_requests (user_id)
where user_id is not null and status in ('pending', 'processing');

create index if not exists account_deletion_requests_requested_at_idx
on public.account_deletion_requests (requested_at desc);

drop function if exists public.request_account_deletion(text);
create function public.request_account_deletion(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  request_id uuid;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if normalized_reason is not null and char_length(normalized_reason) > 1000 then
    raise exception 'Reason is too long' using errcode = '22001';
  end if;

  select r.id into request_id
  from public.account_deletion_requests r
  where r.user_id = caller_id and r.status in ('pending', 'processing')
  order by r.requested_at desc
  limit 1;

  if request_id is null then
    insert into public.account_deletion_requests (user_id, reason)
    values (caller_id, normalized_reason)
    returning id into request_id;
  end if;

  return request_id;
end;
$$;

revoke all on function public.request_account_deletion(text)
from public, anon, authenticated;
grant execute on function public.request_account_deletion(text) to authenticated;

drop function if exists public.get_my_account_deletion_request();
create function public.get_my_account_deletion_request()
returns table (id uuid, status text, requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.status, r.requested_at
  from public.account_deletion_requests r
  where r.user_id = (select auth.uid())
  order by r.requested_at desc
  limit 1;
$$;

revoke all on function public.get_my_account_deletion_request()
from public, anon, authenticated;
grant execute on function public.get_my_account_deletion_request() to authenticated;

drop function if exists public.get_admin_account_deletion_requests();
create function public.get_admin_account_deletion_requests()
returns table (
  id uuid,
  user_id uuid,
  email text,
  reason text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz
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
    select 1 from public.profiles p where p.id = caller_id and p.role = 'admin'
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select r.id, r.user_id, u.email::text, r.reason, r.status, r.requested_at, r.reviewed_at
  from public.account_deletion_requests r
  left join auth.users u on u.id = r.user_id
  order by r.requested_at desc;
end;
$$;

revoke all on function public.get_admin_account_deletion_requests()
from public, anon, authenticated;
grant execute on function public.get_admin_account_deletion_requests() to authenticated;

create table if not exists public.terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version)
);

alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from public, anon, authenticated;

create or replace function public.record_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false')) = 'true' then
    insert into public.terms_acceptances (
      user_id, terms_version, privacy_version, accepted_at
    ) values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'terms_version', ''), 'unknown'),
      coalesce(nullif(new.raw_user_meta_data ->> 'privacy_version', ''), 'unknown'),
      case
        when coalesce(new.raw_user_meta_data ->> 'accepted_at', '') ~
          '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
        then (new.raw_user_meta_data ->> 'accepted_at')::timestamptz
        else now()
      end
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_terms_acceptance()
from public, anon, authenticated;

drop trigger if exists record_terms_acceptance_after_signup on auth.users;
create trigger record_terms_acceptance_after_signup
after insert on auth.users
for each row execute function public.record_terms_acceptance();
