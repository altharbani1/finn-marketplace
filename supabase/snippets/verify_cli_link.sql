select jsonb_build_object(
  'tables', (
    select jsonb_object_agg(name, to_regclass('public.' || name) is not null)
    from (values
      ('profiles'), ('listings'), ('comments'), ('reports'), ('chat_threads'),
      ('messages'), ('seller_ratings'), ('account_deletion_requests'),
      ('terms_acceptances'), ('admin_audit_log'), ('trust_notifications')
    ) as expected(name)
  ),
  'functions', jsonb_build_object(
    'get_my_profile', to_regprocedure('public.get_my_profile()') is not null,
    'search_marketplace_listings', to_regprocedure('public.search_marketplace_listings(text,integer,integer)') is not null,
    'get_admin_dashboard_summary', to_regprocedure('public.get_admin_dashboard_summary()') is not null,
    'get_seller_rating_summary', to_regprocedure('public.get_seller_rating_summary(uuid,integer)') is not null,
    'submit_trust_report', to_regprocedure('public.submit_trust_report(uuid,uuid,text,text,jsonb)') is not null
  ),
  'buckets', (
    select coalesce(jsonb_agg(id order by id), '[]'::jsonb)
    from storage.buckets
    where id in ('listing-images', 'profile-avatars')
  ),
  'listing_category_values', (
    select jsonb_agg(enumlabel order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.listing_category'::regtype
  )
) as readiness;
