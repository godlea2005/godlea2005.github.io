-- 可恢复的清理 claim：租约接管后重放幂等 Storage 删除，并恢复原 ready/failed 状态。

alter table public.commerce_project_assets
  add column if not exists cleanup_previous_state text;

update public.commerce_project_assets
set cleanup_previous_state = 'ready'
where state = 'deleting' and cleanup_previous_state is null;

alter table public.commerce_project_assets
  drop constraint if exists commerce_project_assets_cleanup_claim_check;
alter table public.commerce_project_assets
  add constraint commerce_project_assets_cleanup_claim_check check (
    (
      state = 'deleting'
      and cleanup_run_id is not null
      and cleanup_reason in ('expired', 'soft_limit')
      and cleanup_claimed_at is not null
      and cleanup_previous_state in ('ready', 'failed')
    )
    or (
      state <> 'deleting'
      and cleanup_run_id is null
      and cleanup_reason is null
      and cleanup_claimed_at is null
      and cleanup_previous_state is null
    )
  );

revoke update (cleanup_previous_state) on public.commerce_project_assets
  from public, anon, authenticated, service_role;

revoke all on function public.release_commerce_asset_cleanup_claim(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_commerce_asset_cleanup(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
drop function public.release_commerce_asset_cleanup_claim(uuid, uuid);
drop function public.finalize_commerce_asset_cleanup(uuid, uuid, timestamptz);

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
  transaction_now timestamptz;
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

  perform pg_catalog.pg_advisory_xact_lock(20260830, 9);
  insert into public.commerce_cleanup_leases (lease_name)
  values ('commerce-assets')
  on conflict (lease_name) do nothing;

  select lease.* into current_lease
  from public.commerce_cleanup_leases as lease
  where lease.lease_name = 'commerce-assets'
  for update;
  transaction_now := pg_catalog.clock_timestamp();

  if current_lease.lease_token is not null and current_lease.lease_until > transaction_now then
    insert into public.cleanup_runs (status, trigger_reason, details, completed_at)
    values (
      'failed', normalized_reason,
      pg_catalog.jsonb_build_object('code', 'cleanup_already_running'), transaction_now
    ) returning id into next_run_id;
    return query select false, null::uuid, next_run_id;
    return;
  end if;

  if current_lease.run_id is not null then
    update public.cleanup_runs
    set status = 'failed',
        details = coalesce(details, '{}'::jsonb)
          || pg_catalog.jsonb_build_object('code', 'cleanup_lease_expired'),
        completed_at = transaction_now
    where id = current_lease.run_id and status = 'running';
  end if;

  next_token := pg_catalog.gen_random_uuid();
  insert into public.cleanup_runs (status, trigger_reason)
  values ('running', normalized_reason)
  returning id into next_run_id;

  update public.commerce_cleanup_leases
  set lease_token = next_token,
      lease_until = transaction_now + pg_catalog.make_interval(secs => p_lease_seconds),
      run_id = next_run_id,
      updated_at = transaction_now
  where lease_name = 'commerce-assets';

  -- No valid former owner remains while the global transaction fence is held.
  -- Adopt instead of release: Storage may already have been removed by the crashed run.
  update public.commerce_project_assets
  set cleanup_run_id = next_run_id,
      cleanup_claimed_at = transaction_now
  where state = 'deleting';

  return query select true, next_token, next_run_id;
end;
$$;

create or replace function public.list_commerce_cleanup_claims(
  p_run_id uuid,
  p_lease_token uuid
)
returns table (
  id uuid,
  project_id uuid,
  storage_path text,
  size_bytes bigint,
  expires_at timestamptz,
  state text,
  created_at timestamptz,
  locked boolean,
  cleanup_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260830, 9);
  perform 1 from public.commerce_cleanup_leases as lease
  join public.cleanup_runs as cleanup on cleanup.id = lease.run_id
  where lease.lease_name = 'commerce-assets'
    and lease.run_id = p_run_id
    and lease.lease_token = p_lease_token
    and lease.lease_until > pg_catalog.clock_timestamp()
    and cleanup.status = 'running'
  for update of lease;
  if not found then
    raise exception 'cleanup lease not owned' using errcode = '42501';
  end if;

  return query
  select asset.id, asset.project_id, asset.storage_path, asset.size_bytes,
    asset.expires_at, asset.state, asset.created_at, project.locked, asset.cleanup_reason
  from public.commerce_project_assets as asset
  join public.commerce_projects as project on project.id = asset.project_id
  where asset.state = 'deleting' and asset.cleanup_run_id = p_run_id
  order by asset.cleanup_claimed_at, asset.id;
end;
$$;

create or replace function public.claim_commerce_asset_for_cleanup(
  p_run_id uuid,
  p_lease_token uuid,
  p_asset_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  project_locked boolean;
  asset_row public.commerce_project_assets%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('expired', 'soft_limit') then
    raise exception 'invalid cleanup reason' using errcode = '22023';
  end if;

  -- All cleanup lease operations take this global fence before row locks.
  perform pg_catalog.pg_advisory_xact_lock(20260830, 9);
  perform 1 from public.commerce_cleanup_leases as lease
  where lease.lease_name = 'commerce-assets'
    and lease.run_id = p_run_id
    and lease.lease_token = p_lease_token
  for update;
  if not found then
    raise exception 'cleanup lease not owned' using errcode = '42501';
  end if;

  select asset.project_id into target_project_id
  from public.commerce_project_assets as asset where asset.id = p_asset_id;
  if not found then return false; end if;

  select project.locked into project_locked
  from public.commerce_projects as project
  where project.id = target_project_id
  for update;
  if not found then return false; end if;

  select asset.* into asset_row
  from public.commerce_project_assets as asset
  where asset.id = p_asset_id and asset.project_id = target_project_id
  for update;
  if not found then return false; end if;

  -- Recheck using wall-clock time after every potentially blocking project/asset lock.
  if not exists (
    select 1 from public.commerce_cleanup_leases as lease
    join public.cleanup_runs as cleanup on cleanup.id = lease.run_id
    where lease.lease_name = 'commerce-assets'
      and lease.run_id = p_run_id
      and lease.lease_token = p_lease_token
      and lease.lease_until > pg_catalog.clock_timestamp()
      and cleanup.status = 'running'
  ) then
    raise exception 'cleanup lease expired while waiting for asset fence' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.commerce_generations as generation
    where generation.project_id = target_project_id
      and generation.status in ('queued', 'processing')
  ) then return false; end if;
  if asset_row.deleted_at is not null then return false; end if;

  if p_reason = 'expired' then
    if asset_row.state not in ('ready', 'failed')
       or asset_row.expires_at > pg_catalog.clock_timestamp() then return false; end if;
  elsif p_reason = 'soft_limit' then
    if asset_row.state <> 'ready' or project_locked
       or asset_row.expires_at <= pg_catalog.clock_timestamp() then return false; end if;
  end if;

  update public.commerce_project_assets
  set state = 'deleting',
      cleanup_run_id = p_run_id,
      cleanup_reason = p_reason,
      cleanup_claimed_at = pg_catalog.clock_timestamp(),
      cleanup_previous_state = asset_row.state
  where id = p_asset_id and state = asset_row.state;
  return found;
end;
$$;

create or replace function public.release_commerce_asset_cleanup_claim(
  p_run_id uuid,
  p_lease_token uuid,
  p_asset_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  previous_state text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20260830, 9);
  perform 1 from public.commerce_cleanup_leases as lease
  where lease.lease_name = 'commerce-assets' and lease.run_id = p_run_id
    and lease.lease_token = p_lease_token for update;
  if not found then raise exception 'cleanup lease not owned' using errcode = '42501'; end if;

  select asset.project_id into target_project_id
  from public.commerce_project_assets as asset where asset.id = p_asset_id;
  if not found then return false; end if;
  perform 1 from public.commerce_projects as project
  where project.id = target_project_id for update;
  select asset.cleanup_previous_state into previous_state
  from public.commerce_project_assets as asset
  where asset.id = p_asset_id and asset.state = 'deleting'
    and asset.cleanup_run_id = p_run_id for update;
  if not found then return false; end if;

  if not exists (
    select 1 from public.commerce_cleanup_leases as lease
    join public.cleanup_runs as cleanup on cleanup.id = lease.run_id
    where lease.lease_name = 'commerce-assets' and lease.run_id = p_run_id
      and lease.lease_token = p_lease_token
      and lease.lease_until > pg_catalog.clock_timestamp()
      and cleanup.status = 'running'
  ) then raise exception 'cleanup lease expired while waiting for asset fence' using errcode = '42501'; end if;

  update public.commerce_project_assets
  set state = previous_state, cleanup_run_id = null, cleanup_reason = null,
      cleanup_claimed_at = null, cleanup_previous_state = null
  where id = p_asset_id and state = 'deleting' and cleanup_run_id = p_run_id;
  return found;
end;
$$;

create or replace function public.finalize_commerce_asset_cleanup(
  p_run_id uuid,
  p_lease_token uuid,
  p_asset_id uuid,
  p_deleted_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20260830, 9);
  perform 1 from public.commerce_cleanup_leases as lease
  where lease.lease_name = 'commerce-assets' and lease.run_id = p_run_id
    and lease.lease_token = p_lease_token for update;
  if not found then raise exception 'cleanup lease not owned' using errcode = '42501'; end if;

  select asset.project_id into target_project_id
  from public.commerce_project_assets as asset where asset.id = p_asset_id;
  if not found then return false; end if;
  perform 1 from public.commerce_projects as project
  where project.id = target_project_id for update;
  perform 1 from public.commerce_project_assets as asset
  where asset.id = p_asset_id and asset.state = 'deleting'
    and asset.cleanup_run_id = p_run_id for update;
  if not found then return false; end if;

  if not exists (
    select 1 from public.commerce_cleanup_leases as lease
    join public.cleanup_runs as cleanup on cleanup.id = lease.run_id
    where lease.lease_name = 'commerce-assets' and lease.run_id = p_run_id
      and lease.lease_token = p_lease_token
      and lease.lease_until > pg_catalog.clock_timestamp()
      and cleanup.status = 'running'
  ) then raise exception 'cleanup lease expired while waiting for asset fence' using errcode = '42501'; end if;

  update public.commerce_project_assets
  set state = 'deleted', deleted_at = coalesce(p_deleted_at, pg_catalog.clock_timestamp()),
      cleanup_run_id = null, cleanup_reason = null, cleanup_claimed_at = null,
      cleanup_previous_state = null
  where id = p_asset_id and state = 'deleting' and cleanup_run_id = p_run_id;
  return found;
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
  outstanding_claims integer;
  final_status text := p_status;
  final_details jsonb := p_details;
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
  perform 1 from public.commerce_cleanup_leases as lease
  where lease.lease_name = 'commerce-assets' and lease.lease_token = p_lease_token
    and lease.run_id = p_run_id for update;
  if not found then raise exception 'cleanup lease not owned' using errcode = '42501'; end if;

  select pg_catalog.count(*)::integer into outstanding_claims
  from public.commerce_project_assets as asset
  where asset.state = 'deleting' and asset.cleanup_run_id = p_run_id;
  if outstanding_claims > 0 then
    final_status := 'partial';
    final_details := final_details || pg_catalog.jsonb_build_object(
      'recovery_code', 'cleanup_claims_require_replay',
      'outstanding_claims', outstanding_claims
    );
  end if;

  update public.cleanup_runs
  set status = final_status, assets_examined = p_assets_examined,
      assets_deleted = p_assets_deleted, bytes_before = p_bytes_before,
      bytes_deleted = p_bytes_deleted, bytes_after = p_bytes_after,
      details = final_details, completed_at = pg_catalog.clock_timestamp()
  where id = p_run_id and status = 'running';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'cleanup run not active' using errcode = '55000';
  end if;

  if outstanding_claims > 0 then
    update public.commerce_cleanup_leases
    set lease_until = pg_catalog.clock_timestamp() - interval '1 second',
        updated_at = pg_catalog.clock_timestamp()
    where lease_name = 'commerce-assets';
  else
    update public.commerce_cleanup_leases
    set lease_token = null, lease_until = '-infinity'::timestamptz,
        run_id = null, updated_at = pg_catalog.clock_timestamp()
    where lease_name = 'commerce-assets';
  end if;
end;
$$;

revoke all on function public.begin_commerce_cleanup(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.list_commerce_cleanup_claims(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_commerce_asset_for_cleanup(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.release_commerce_asset_cleanup_claim(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_commerce_asset_cleanup(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_commerce_cleanup(uuid, uuid, text, integer, integer, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.begin_commerce_cleanup(text, integer) to service_role;
grant execute on function public.list_commerce_cleanup_claims(uuid, uuid) to service_role;
grant execute on function public.claim_commerce_asset_for_cleanup(uuid, uuid, uuid, text) to service_role;
grant execute on function public.release_commerce_asset_cleanup_claim(uuid, uuid, uuid) to service_role;
grant execute on function public.finalize_commerce_asset_cleanup(uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.finish_commerce_cleanup(uuid, uuid, text, integer, integer, bigint, bigint, bigint, jsonb) to service_role;
