-- AI 电商私有资源清理：跨请求租约、清理运行记录和 stale 任务安全恢复。

create table if not exists public.commerce_cleanup_leases (
  lease_name text primary key check (lease_name = 'commerce-assets'),
  lease_token uuid,
  lease_until timestamptz not null default '-infinity'::timestamptz,
  run_id uuid references public.cleanup_runs(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (
    (lease_token is null and run_id is null)
    or (lease_token is not null and run_id is not null)
  )
);

alter table public.commerce_cleanup_leases enable row level security;
revoke all on public.commerce_cleanup_leases from public, anon, authenticated, service_role;

create or replace function public.begin_commerce_cleanup(
  p_trigger_reason text,
  p_lease_seconds integer default 900
)
returns table (
  acquired boolean,
  lease_token uuid,
  run_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_reason text := pg_catalog.btrim(p_trigger_reason);
  current_lease public.commerce_cleanup_leases%rowtype;
  next_token uuid;
  next_run_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if normalized_reason not in ('scheduled', 'soft_limit', 'manual') then
    raise exception 'invalid cleanup trigger' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'invalid cleanup lease duration' using errcode = '22023';
  end if;

  -- The transaction lock serializes the lease claim itself; the persisted expiry protects
  -- the whole multi-request Edge execution after this short RPC transaction has ended.
  perform pg_catalog.pg_advisory_xact_lock(20260830, 9);
  insert into public.commerce_cleanup_leases (lease_name)
  values ('commerce-assets')
  on conflict (lease_name) do nothing;

  select lease.*
  into current_lease
  from public.commerce_cleanup_leases as lease
  where lease.lease_name = 'commerce-assets'
  for update;

  if current_lease.lease_token is not null and current_lease.lease_until > pg_catalog.now() then
    insert into public.cleanup_runs (
      status,
      trigger_reason,
      details,
      completed_at
    ) values (
      'failed',
      normalized_reason,
      pg_catalog.jsonb_build_object('code', 'cleanup_already_running'),
      pg_catalog.now()
    ) returning id into next_run_id;

    return query select false, null::uuid, next_run_id;
    return;
  end if;

  if current_lease.run_id is not null then
    update public.cleanup_runs
    set status = 'failed',
        details = pg_catalog.jsonb_build_object('code', 'cleanup_lease_expired'),
        completed_at = pg_catalog.now()
    where id = current_lease.run_id
      and status = 'running';
  end if;

  next_token := pg_catalog.gen_random_uuid();
  insert into public.cleanup_runs (status, trigger_reason)
  values ('running', normalized_reason)
  returning id into next_run_id;

  update public.commerce_cleanup_leases
  set lease_token = next_token,
      lease_until = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      run_id = next_run_id,
      updated_at = pg_catalog.now()
  where lease_name = 'commerce-assets';

  return query select true, next_token, next_run_id;
end;
$$;

create or replace function public.finish_commerce_cleanup(
  p_run_id uuid,
  p_lease_token uuid,
  p_status text,
  p_assets_examined integer,
  p_assets_deleted integer,
  p_bytes_before bigint,
  p_bytes_deleted bigint,
  p_bytes_after bigint,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_status not in ('completed', 'partial', 'failed') then
    raise exception 'invalid cleanup status' using errcode = '22023';
  end if;
  if p_assets_examined < 0 or p_assets_deleted < 0
     or p_bytes_before < 0 or p_bytes_deleted < 0 or p_bytes_after < 0 then
    raise exception 'invalid cleanup counters' using errcode = '22023';
  end if;
  if p_details is null or pg_catalog.jsonb_typeof(p_details) <> 'object'
     or pg_catalog.pg_column_size(p_details) > 32768 then
    raise exception 'invalid cleanup details' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260830, 9);
  perform 1
  from public.commerce_cleanup_leases as lease
  where lease.lease_name = 'commerce-assets'
    and lease.lease_token = p_lease_token
    and lease.run_id = p_run_id
  for update;
  if not found then
    raise exception 'cleanup lease not owned' using errcode = '42501';
  end if;

  update public.cleanup_runs
  set status = p_status,
      assets_examined = p_assets_examined,
      assets_deleted = p_assets_deleted,
      bytes_before = p_bytes_before,
      bytes_deleted = p_bytes_deleted,
      bytes_after = p_bytes_after,
      details = p_details,
      completed_at = pg_catalog.now()
  where id = p_run_id
    and status = 'running';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'cleanup run not active' using errcode = '55000';
  end if;

  update public.commerce_cleanup_leases
  set lease_token = null,
      lease_until = '-infinity'::timestamptz,
      run_id = null,
      updated_at = pg_catalog.now()
  where lease_name = 'commerce-assets';
end;
$$;

create or replace function public.get_commerce_cleanup_settings()
returns table (
  storage_soft_limit_bytes text,
  storage_target_bytes text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  return query
  select
    (select setting.value #>> '{}' from public.app_settings as setting where setting.key = 'storage_soft_limit_bytes'),
    (select setting.value #>> '{}' from public.app_settings as setting where setting.key = 'storage_target_bytes');
end;
$$;

create or replace function public.restore_commerce_assets_after_stale_generation(
  p_generation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale_generation public.commerce_generations%rowtype;
  restored integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select generation.*
  into stale_generation
  from public.commerce_generations as generation
  where generation.id = p_generation_id
  for update;

  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;
  if stale_generation.status <> 'failed' or stale_generation.project_id is null then
    return 0;
  end if;

  update public.commerce_project_assets as asset
  set state = 'ready'
  where asset.project_id = stale_generation.project_id
    and asset.user_id = stale_generation.user_id
    and asset.state = 'processing'
    and not exists (
      select 1
      from public.commerce_generations as active_generation
      where active_generation.project_id = stale_generation.project_id
        and active_generation.id <> stale_generation.id
        and active_generation.status in ('queued', 'processing')
    );
  get diagnostics restored = row_count;
  return restored;
end;
$$;

revoke all on function public.begin_commerce_cleanup(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.finish_commerce_cleanup(uuid, uuid, text, integer, integer, bigint, bigint, bigint, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_commerce_cleanup_settings() from public, anon, authenticated, service_role;
revoke all on function public.restore_commerce_assets_after_stale_generation(uuid) from public, anon, authenticated, service_role;

grant execute on function public.begin_commerce_cleanup(text, integer) to service_role;
grant execute on function public.finish_commerce_cleanup(uuid, uuid, text, integer, integer, bigint, bigint, bigint, jsonb) to service_role;
grant execute on function public.get_commerce_cleanup_settings() to service_role;
grant execute on function public.restore_commerce_assets_after_stale_generation(uuid) to service_role;
