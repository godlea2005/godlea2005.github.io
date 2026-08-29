-- 清理候选原子 claim/fence：阻止清理与项目锁定、排队和分析任务交错。

alter table public.commerce_project_assets
  add column if not exists cleanup_run_id uuid references public.cleanup_runs(id) on delete set null,
  add column if not exists cleanup_reason text,
  add column if not exists cleanup_claimed_at timestamptz;

alter table public.commerce_project_assets
  drop constraint if exists commerce_project_assets_state_check;
alter table public.commerce_project_assets
  add constraint commerce_project_assets_state_check
  check (state in ('uploading','ready','processing','deleting','deleted','failed'));

alter table public.commerce_project_assets
  drop constraint if exists commerce_project_assets_cleanup_claim_check;
alter table public.commerce_project_assets
  add constraint commerce_project_assets_cleanup_claim_check check (
    (
      state = 'deleting'
      and cleanup_run_id is not null
      and cleanup_reason in ('expired', 'soft_limit')
      and cleanup_claimed_at is not null
    )
    or (
      state <> 'deleting'
      and cleanup_run_id is null
      and cleanup_reason is null
      and cleanup_claimed_at is null
    )
  );

create index if not exists commerce_project_assets_cleanup_run_idx
  on public.commerce_project_assets(cleanup_run_id)
  where cleanup_run_id is not null;

revoke update (cleanup_run_id, cleanup_reason, cleanup_claimed_at) on public.commerce_project_assets
  from public, anon, authenticated, service_role;

-- Browsers may only create an uploading row and transition that same row to ready/failed.
-- They cannot forge, clear, update, or delete a service-owned cleanup claim.
drop policy if exists "commerce_assets_insert_own" on public.commerce_project_assets;
create policy "commerce_assets_insert_own"
on public.commerce_project_assets for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and state = 'uploading'
  and deleted_at is null
  and cleanup_run_id is null and cleanup_reason is null and cleanup_claimed_at is null
  and (storage.foldername(storage_path))[1] = (select auth.uid())::text
  and (storage.foldername(storage_path))[2] = project_id::text
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_assets_update_own" on public.commerce_project_assets;
create policy "commerce_assets_update_own"
on public.commerce_project_assets for update to authenticated
using (
  (select auth.uid()) = user_id
  and state = 'uploading'
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
)
with check (
  (select auth.uid()) = user_id
  and state in ('ready', 'failed')
  and deleted_at is null
  and cleanup_run_id is null and cleanup_reason is null and cleanup_claimed_at is null
  and (storage.foldername(storage_path))[1] = (select auth.uid())::text
  and (storage.foldername(storage_path))[2] = project_id::text
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_assets_delete_own" on public.commerce_project_assets;
create policy "commerce_assets_delete_own"
on public.commerce_project_assets for delete to authenticated
using (
  (select auth.uid()) = user_id
  and state <> 'deleting'
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

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
  if not exists (
    select 1
    from public.commerce_cleanup_leases as lease
    join public.cleanup_runs as cleanup on cleanup.id = lease.run_id
    where lease.lease_name = 'commerce-assets'
      and lease.run_id = p_run_id
      and lease.lease_token = p_lease_token
      and lease.lease_until > pg_catalog.now()
      and cleanup.status = 'running'
  ) then
    raise exception 'cleanup lease not owned' using errcode = '42501';
  end if;

  select asset.project_id
  into target_project_id
  from public.commerce_project_assets as asset
  where asset.id = p_asset_id;
  if not found then return false; end if;

  -- Project row is the shared fence used by generation begin, user lock UPDATE, and
  -- cleanup claim. Eligibility is re-read only after this lock is held.
  select project.locked
  into project_locked
  from public.commerce_projects as project
  where project.id = target_project_id
  for update;
  if not found then return false; end if;

  select asset.*
  into asset_row
  from public.commerce_project_assets as asset
  where asset.id = p_asset_id
    and asset.project_id = target_project_id
  for update;
  if not found then return false; end if;

  if exists (
    select 1
    from public.commerce_generations as generation
    where generation.project_id = target_project_id
      and generation.status in ('queued', 'processing')
  ) then
    return false;
  end if;
  if asset_row.state <> 'ready' or asset_row.deleted_at is not null then return false; end if;
  if p_reason = 'expired' and asset_row.expires_at > pg_catalog.now() then return false; end if;
  if p_reason = 'soft_limit' and (project_locked or asset_row.expires_at <= pg_catalog.now()) then return false; end if;

  update public.commerce_project_assets
  set state = 'deleting',
      cleanup_run_id = p_run_id,
      cleanup_reason = p_reason,
      cleanup_claimed_at = pg_catalog.now()
  where id = p_asset_id
    and state = 'ready';
  return found;
end;
$$;

create or replace function public.release_commerce_asset_cleanup_claim(
  p_run_id uuid,
  p_asset_id uuid
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
  select asset.project_id into target_project_id
  from public.commerce_project_assets as asset where asset.id = p_asset_id;
  if not found then return false; end if;
  perform 1 from public.commerce_projects as project
  where project.id = target_project_id for update;

  update public.commerce_project_assets
  set state = 'ready',
      cleanup_run_id = null,
      cleanup_reason = null,
      cleanup_claimed_at = null
  where id = p_asset_id
    and state = 'deleting'
    and cleanup_run_id = p_run_id;
  return found;
end;
$$;

create or replace function public.finalize_commerce_asset_cleanup(
  p_run_id uuid,
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
  select asset.project_id into target_project_id
  from public.commerce_project_assets as asset where asset.id = p_asset_id;
  if not found then return false; end if;
  perform 1 from public.commerce_projects as project
  where project.id = target_project_id for update;

  update public.commerce_project_assets
  set state = 'deleted',
      deleted_at = coalesce(p_deleted_at, pg_catalog.now()),
      cleanup_run_id = null,
      cleanup_reason = null,
      cleanup_claimed_at = null
  where id = p_asset_id
    and state = 'deleting'
    and cleanup_run_id = p_run_id;
  return found;
end;
$$;

create or replace function public.set_commerce_generation_assets_state(
  p_generation_id uuid,
  p_asset_ids uuid[],
  p_state text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  generation_row public.commerce_generations%rowtype;
  requested_count integer;
  matched_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_state is null or p_state not in ('processing', 'ready') or p_asset_ids is null
     or pg_catalog.cardinality(p_asset_ids) < 1 then
    raise exception 'invalid asset state request' using errcode = '22023';
  end if;
  select pg_catalog.count(distinct asset_id)::integer into requested_count
  from pg_catalog.unnest(p_asset_ids) as requested(asset_id);

  select generation.* into generation_row
  from public.commerce_generations as generation
  where generation.id = p_generation_id;
  if not found or generation_row.project_id is null then
    raise exception 'generation context missing' using errcode = 'P0002';
  end if;
  perform 1 from public.commerce_projects as project
  where project.id = generation_row.project_id for update;
  select generation.* into generation_row
  from public.commerce_generations as generation
  where generation.id = p_generation_id for update;

  if p_state = 'processing' then
    if generation_row.status not in ('queued', 'processing') then
      raise exception 'generation is not active' using errcode = '55000';
    end if;
    select pg_catalog.count(*)::integer into matched_count
    from public.commerce_project_assets as asset
    where asset.id = any(p_asset_ids)
      and asset.project_id = generation_row.project_id
      and asset.user_id = generation_row.user_id
      and asset.state = 'ready'
      and asset.deleted_at is null;
    if matched_count <> requested_count then
      raise exception 'generation assets are not ready' using errcode = '55000';
    end if;
    update public.commerce_project_assets
    set state = 'processing'
    where id = any(p_asset_ids)
      and project_id = generation_row.project_id
      and user_id = generation_row.user_id
      and state = 'ready';
    update public.commerce_generations
    set status = 'processing', started_at = coalesce(started_at, pg_catalog.now())
    where id = p_generation_id and status in ('queued', 'processing');
    return matched_count;
  end if;

  if generation_row.status not in ('completed', 'failed', 'cancelled') then
    raise exception 'generation is not terminal' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.commerce_generations as generation
    where generation.project_id = generation_row.project_id
      and generation.id <> p_generation_id
      and generation.status in ('queued', 'processing')
  ) then
    return 0;
  end if;
  update public.commerce_project_assets
  set state = 'ready'
  where id = any(p_asset_ids)
    and project_id = generation_row.project_id
    and user_id = generation_row.user_id
    and state = 'processing';
  get diagnostics matched_count = row_count;
  return matched_count;
end;
$$;

create or replace function public.begin_commerce_generation(
  p_project_id uuid,
  p_idempotency_key text
)
returns table (
  generation_id uuid,
  status text,
  charged boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text;
  lock_bytes bytea;
  lock_key_one integer;
  lock_key_two integer;
  entitlement public.user_entitlements%rowtype;
  existing_generation public.commerce_generations%rowtype;
  new_generation_id uuid;
  new_balance integer;
  generations_today bigint;
begin
  if current_user_id is null or not exists (
    select 1 from auth.users as auth_user
    where auth_user.id = current_user_id
      and not coalesce(auth_user.is_anonymous, false)
  ) then
    raise exception 'commerce authentication required' using errcode = '28000';
  end if;
  if p_project_id is null then
    raise exception 'project is required' using errcode = '22023';
  end if;
  normalized_key := pg_catalog.btrim(p_idempotency_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 1 and 200 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  lock_bytes := pg_catalog.uuid_send(current_user_id);
  lock_key_one :=
    (pg_catalog.get_byte(lock_bytes, 0) & 127) * 16777216
    + pg_catalog.get_byte(lock_bytes, 1) * 65536
    + pg_catalog.get_byte(lock_bytes, 2) * 256
    + pg_catalog.get_byte(lock_bytes, 3);
  lock_key_two :=
    (pg_catalog.get_byte(lock_bytes, 4) & 127) * 16777216
    + pg_catalog.get_byte(lock_bytes, 5) * 65536
    + pg_catalog.get_byte(lock_bytes, 6) * 256
    + pg_catalog.get_byte(lock_bytes, 7);
  perform pg_catalog.pg_advisory_xact_lock(lock_key_one, lock_key_two);

  -- This row lock is the fence shared with cleanup claim and a user's project-lock UPDATE.
  perform 1
  from public.commerce_projects as project
  where project.id = p_project_id
    and project.user_id = current_user_id
  for update;
  if not found then
    raise exception 'project not found or forbidden' using errcode = 'P0002';
  end if;

  select entitlement_row.* into entitlement
  from public.user_entitlements as entitlement_row
  where entitlement_row.user_id = current_user_id
  for update;
  if not found then
    raise exception 'entitlement not found' using errcode = 'P0002';
  end if;
  if entitlement.disabled then
    raise exception 'commerce account disabled' using errcode = '42501';
  end if;

  select generation.* into existing_generation
  from public.commerce_generations as generation
  where generation.user_id = current_user_id
    and generation.idempotency_key = normalized_key;
  if found then
    if existing_generation.project_id is distinct from p_project_id then
      raise exception 'idempotency key already used for another project' using errcode = '23505';
    end if;
    return query select existing_generation.id, existing_generation.status, false;
    return;
  end if;

  if exists (
    select 1 from public.commerce_project_assets as asset
    where asset.project_id = p_project_id and asset.state = 'deleting'
  ) then
    raise exception 'project assets are being cleaned' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.commerce_project_assets as asset
    where asset.project_id = p_project_id
      and asset.user_id = current_user_id
      and asset.state = 'ready'
      and asset.deleted_at is null
      and asset.expires_at > pg_catalog.now()
  ) then
    raise exception 'project has no ready assets' using errcode = '55000';
  end if;

  select pg_catalog.count(*) into generations_today
  from public.commerce_generations as generation
  where generation.user_id = current_user_id
    and generation.created_at >= (
      pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC'
    );
  if generations_today >= entitlement.daily_limit then
    raise exception 'daily generation limit reached' using errcode = 'P0001';
  end if;

  if not entitlement.unlimited then
    update public.user_entitlements
    set credits = credits - 1, updated_at = pg_catalog.now()
    where user_id = (select auth.uid()) and credits > 0
    returning credits into new_balance;
    if not found then
      raise exception 'insufficient credits' using errcode = 'P0001';
    end if;
  end if;

  insert into public.commerce_generations (
    project_id, user_id, idempotency_key, status, credit_charged
  ) values (
    p_project_id, current_user_id, normalized_key, 'queued', not entitlement.unlimited
  ) returning id into new_generation_id;

  if not entitlement.unlimited then
    insert into public.credit_ledger (
      user_id, generation_id, delta, balance_after, reason, metadata
    ) values (
      current_user_id, new_generation_id, -1, new_balance, 'generation',
      pg_catalog.jsonb_build_object('project_id', p_project_id)
    );
  end if;
  return query select new_generation_id, 'queued'::text, true;
end;
$$;

revoke all on function public.claim_commerce_asset_for_cleanup(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.release_commerce_asset_cleanup_claim(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_commerce_asset_cleanup(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.set_commerce_generation_assets_state(uuid, uuid[], text)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_commerce_generation(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_commerce_asset_for_cleanup(uuid, uuid, uuid, text) to service_role;
grant execute on function public.release_commerce_asset_cleanup_claim(uuid, uuid) to service_role;
grant execute on function public.finalize_commerce_asset_cleanup(uuid, uuid, timestamptz) to service_role;
grant execute on function public.set_commerce_generation_assets_state(uuid, uuid[], text) to service_role;
grant execute on function public.begin_commerce_generation(uuid, text) to authenticated;
