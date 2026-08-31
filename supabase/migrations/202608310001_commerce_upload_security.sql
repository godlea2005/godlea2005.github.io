-- Secure commerce uploads behind bounded reservations and make terminal recovery atomic.

revoke insert, update, delete on public.commerce_project_assets from authenticated;

drop policy if exists "commerce_assets_insert_own" on public.commerce_project_assets;
drop policy if exists "commerce_assets_update_own" on public.commerce_project_assets;
drop policy if exists "commerce_assets_delete_own" on public.commerce_project_assets;
drop policy if exists "commerce_storage_insert_own" on storage.objects;

alter table public.commerce_project_assets
  add column if not exists validation_attempt_id uuid,
  add column if not exists validation_started_at timestamptz;

alter table public.commerce_project_assets
  drop constraint if exists commerce_project_assets_state_check;
alter table public.commerce_project_assets
  add constraint commerce_project_assets_state_check
  check (state in ('uploading','validating','ready','processing','deleting','deleted','failed'));

alter table public.commerce_project_assets
  drop constraint if exists commerce_project_assets_validation_claim_check;
alter table public.commerce_project_assets
  add constraint commerce_project_assets_validation_claim_check check (
    (
      state = 'validating'
      and validation_attempt_id is not null
      and validation_started_at is not null
    )
    or (
      state <> 'validating'
      and validation_attempt_id is null
      and validation_started_at is null
    )
  );

create or replace function public.reserve_commerce_asset(
  p_project_id uuid,
  p_extension text,
  p_mime_type text,
  p_size_bytes bigint
)
returns table (
  id uuid,
  project_id uuid,
  user_id uuid,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  expires_at timestamptz,
  state text,
  deleted_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_extension text := pg_catalog.lower(pg_catalog.btrim(p_extension, '. '));
  normalized_mime_type text := pg_catalog.lower(pg_catalog.btrim(p_mime_type));
  max_project_images integer;
  active_asset_count integer;
  asset_id uuid := pg_catalog.gen_random_uuid();
  generated_storage_path text;
begin
  if auth.role() is distinct from 'authenticated'
     or current_user_id is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'commerce authentication required' using errcode = '28000';
  end if;
  if p_project_id is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if p_size_bytes is null or p_size_bytes not between 1 and 8388608 then
    raise exception 'invalid asset size' using errcode = '22023';
  end if;
  if normalized_extension is null or normalized_mime_type is null
     or not (
       (normalized_extension in ('jpg', 'jpeg') and normalized_mime_type = 'image/jpeg')
       or (normalized_extension = 'png' and normalized_mime_type = 'image/png')
       or (normalized_extension = 'webp' and normalized_mime_type = 'image/webp')
     ) then
    raise exception 'invalid asset extension or MIME type' using errcode = '22023';
  end if;

  if normalized_mime_type = 'image/jpeg' then
    normalized_extension := 'jpg';
  end if;

  perform 1
  from public.commerce_projects as project
  where project.id = p_project_id
    and project.user_id = current_user_id
  for update;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- The project row is the shared reservation/generation/cleanup concurrency fence.
  perform 1
  from public.commerce_project_assets as asset
  where asset.project_id = p_project_id
    and asset.state in ('uploading', 'validating', 'ready', 'processing', 'deleting')
  for update;

  if exists (
    select 1
    from public.commerce_project_assets as asset
    where asset.project_id = p_project_id
      and asset.state = 'deleting'
  ) then
    raise exception 'project assets are being cleaned' using errcode = '55000';
  end if;

  select coalesce(
    (
      select (setting.value #>> '{}')::integer
      from public.app_settings as setting
      where setting.key = 'max_project_images'
    ),
    6
  ) into max_project_images;

  select pg_catalog.count(*)::integer
  into active_asset_count
  from public.commerce_project_assets as asset
  where asset.project_id = p_project_id
    and asset.state in ('uploading', 'validating', 'ready', 'processing', 'deleting');

  if active_asset_count >= max_project_images then
    raise exception 'project image limit reached' using errcode = '54000';
  end if;

  generated_storage_path := current_user_id::text
    || '/' || p_project_id::text
    || '/' || asset_id::text
    || '.' || normalized_extension;

  insert into public.commerce_project_assets (
    id,
    project_id,
    user_id,
    storage_path,
    mime_type,
    size_bytes,
    state
  ) values (
    asset_id,
    p_project_id,
    current_user_id,
    generated_storage_path,
    normalized_mime_type,
    p_size_bytes,
    'uploading'
  );

  return query
  select asset.id, asset.project_id, asset.user_id, asset.storage_path,
    asset.mime_type, asset.size_bytes, asset.expires_at, asset.state,
    asset.deleted_at, asset.created_at
  from public.commerce_project_assets as asset
  where asset.id = asset_id;
end;
$$;

create or replace function public.claim_commerce_asset_upload_validation(
  p_asset_id uuid,
  p_user_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_row public.commerce_project_assets%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_attempt_id is null then
    raise exception 'validation attempt required' using errcode = '22023';
  end if;

  select asset.*
  into asset_row
  from public.commerce_project_assets as asset
  where asset.id = p_asset_id
    and asset.user_id = p_user_id
  for update;
  if not found then
    raise exception 'asset not found' using errcode = 'P0002';
  end if;
  if asset_row.state = 'validating'
     and asset_row.validation_attempt_id = p_attempt_id then
    return true;
  end if;
  if asset_row.state <> 'uploading' then
    return false;
  end if;

  update public.commerce_project_assets as asset
  set state = 'validating',
      validation_attempt_id = p_attempt_id,
      validation_started_at = pg_catalog.clock_timestamp()
  where asset.id = p_asset_id
    and asset.user_id = p_user_id
    and asset.state = 'uploading';
  return found;
end;
$$;

create or replace function public.release_commerce_asset_upload_validation(
  p_asset_id uuid,
  p_user_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update public.commerce_project_assets as asset
  set state = 'uploading',
      validation_attempt_id = null,
      validation_started_at = null
  where asset.id = p_asset_id
    and asset.user_id = p_user_id
    and asset.state = 'validating'
    and asset.validation_attempt_id = p_attempt_id;
  return found;
end;
$$;

create or replace function public.finalize_commerce_asset_upload(
  p_asset_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_actual_mime_type text,
  p_actual_size_bytes bigint
)
returns table (
  id uuid,
  project_id uuid,
  user_id uuid,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  expires_at timestamptz,
  state text,
  deleted_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_row public.commerce_project_assets%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select asset.*
  into asset_row
  from public.commerce_project_assets as asset
  where asset.id = p_asset_id
    and asset.user_id = p_user_id
  for update;
  if not found then
    raise exception 'asset not found' using errcode = 'P0002';
  end if;

  if asset_row.state = 'ready' then
    if p_actual_mime_type is distinct from asset_row.mime_type
       or p_actual_size_bytes is distinct from asset_row.size_bytes then
      raise exception 'asset metadata mismatch' using errcode = '22023';
    end if;
    return query
    select asset.id, asset.project_id, asset.user_id, asset.storage_path,
      asset.mime_type, asset.size_bytes, asset.expires_at, asset.state,
      asset.deleted_at, asset.created_at
    from public.commerce_project_assets as asset
    where asset.id = p_asset_id and asset.user_id = p_user_id;
    return;
  end if;

  if asset_row.state <> 'validating' then
    raise exception 'asset cannot be finalized' using errcode = '55000';
  end if;
  if asset_row.validation_attempt_id is distinct from p_attempt_id then
    raise exception 'validation attempt mismatch' using errcode = '55000';
  end if;
  if p_actual_mime_type is distinct from asset_row.mime_type
     or p_actual_size_bytes is distinct from asset_row.size_bytes then
    raise exception 'asset metadata mismatch' using errcode = '22023';
  end if;

  update public.commerce_project_assets as asset
  set state = 'ready',
      validation_attempt_id = null,
      validation_started_at = null
  where asset.id = p_asset_id
    and asset.user_id = p_user_id
    and asset.state = 'validating'
    and asset.validation_attempt_id = p_attempt_id;

  return query
  select asset.id, asset.project_id, asset.user_id, asset.storage_path,
    asset.mime_type, asset.size_bytes, asset.expires_at, asset.state,
    asset.deleted_at, asset.created_at
  from public.commerce_project_assets as asset
  where asset.id = p_asset_id and asset.user_id = p_user_id;
end;
$$;

create or replace function public.fail_commerce_asset_upload(
  p_asset_id uuid,
  p_user_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state text;
  current_attempt_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select asset.state, asset.validation_attempt_id
  into current_state, current_attempt_id
  from public.commerce_project_assets as asset
  where asset.id = p_asset_id
    and asset.user_id = p_user_id
  for update;
  if not found then
    raise exception 'asset not found' using errcode = 'P0002';
  end if;
  if current_state <> 'validating' then
    raise exception 'asset cannot be failed' using errcode = '55000';
  end if;
  if current_attempt_id is distinct from p_attempt_id then
    raise exception 'validation attempt mismatch' using errcode = '55000';
  end if;

  update public.commerce_project_assets as asset
  set state = 'failed',
      validation_attempt_id = null,
      validation_started_at = null
  where asset.id = p_asset_id
    and asset.user_id = p_user_id
    and asset.state = 'validating'
    and asset.validation_attempt_id = p_attempt_id;
  return found;
end;
$$;

create or replace function public.complete_commerce_generation(
  p_generation_id uuid,
  p_result jsonb,
  p_provider text,
  p_model text,
  p_usage jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  generation_row public.commerce_generations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_result is null or pg_catalog.jsonb_typeof(p_result) <> 'object' then
    raise exception 'result must be a JSON object' using errcode = '22023';
  end if;
  if p_usage is null or pg_catalog.jsonb_typeof(p_usage) <> 'object' then
    raise exception 'usage must be a JSON object' using errcode = '22023';
  end if;
  if p_provider is null or pg_catalog.char_length(pg_catalog.btrim(p_provider)) not between 1 and 100 then
    raise exception 'invalid provider' using errcode = '22023';
  end if;
  if p_model is null or pg_catalog.char_length(pg_catalog.btrim(p_model)) not between 1 and 200 then
    raise exception 'invalid model' using errcode = '22023';
  end if;

  select generation.project_id
  into target_project_id
  from public.commerce_generations as generation
  where generation.id = p_generation_id;
  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;

  if target_project_id is not null then
    perform 1
    from public.commerce_projects as project
    where project.id = target_project_id
    for update;
  end if;

  select generation.*
  into generation_row
  from public.commerce_generations as generation
  where generation.id = p_generation_id
  for update;
  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;
  if generation_row.status in ('failed', 'cancelled') then
    raise exception 'generation can no longer complete' using errcode = '55000';
  end if;

  if generation_row.status <> 'completed' then
    update public.commerce_generations
    set status = 'completed',
        result_data = p_result,
        provider = pg_catalog.btrim(p_provider),
        model = pg_catalog.btrim(p_model),
        usage = p_usage,
        error_code = null,
        error_message = null,
        started_at = coalesce(started_at, created_at),
        completed_at = pg_catalog.now()
    where id = p_generation_id;
  end if;

  if generation_row.project_id is not null
     and not exists (
       select 1
       from public.commerce_generations as generation
       where generation.project_id = generation_row.project_id
         and generation.id <> p_generation_id
         and generation.status in ('queued', 'processing')
     ) then
    update public.commerce_project_assets
    set state = 'ready'
    where project_id = generation_row.project_id
      and user_id = generation_row.user_id
      and state = 'processing';
  end if;
end;
$$;

create or replace function public.fail_commerce_generation(
  p_generation_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  generation_row public.commerce_generations%rowtype;
  refunded_balance integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select generation.project_id
  into target_project_id
  from public.commerce_generations as generation
  where generation.id = p_generation_id;
  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;

  if target_project_id is not null then
    perform 1
    from public.commerce_projects as project
    where project.id = target_project_id
    for update;
  end if;

  select generation.*
  into generation_row
  from public.commerce_generations as generation
  where generation.id = p_generation_id
  for update;
  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;
  if generation_row.status = 'completed' then
    raise exception 'completed generation cannot fail' using errcode = '55000';
  end if;

  update public.commerce_generations
  set status = 'failed',
      error_code = pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_error_code), ''), 'generation_failed'), 100),
      error_message = pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_error_message), ''), 'Generation failed'), 2000),
      started_at = coalesce(started_at, created_at),
      completed_at = coalesce(completed_at, pg_catalog.now()),
      refunded_at = case
        when generation_row.credit_charged and generation_row.refunded_at is null then pg_catalog.now()
        else refunded_at
      end
  where id = p_generation_id;

  if generation_row.credit_charged and generation_row.refunded_at is null then
    update public.user_entitlements
    set credits = credits + 1,
        updated_at = pg_catalog.now()
    where user_id = generation_row.user_id
    returning credits into refunded_balance;
    if not found then
      raise exception 'entitlement not found for refund' using errcode = 'P0002';
    end if;

    insert into public.credit_ledger (
      user_id,
      generation_id,
      delta,
      balance_after,
      reason,
      metadata
    ) values (
      generation_row.user_id,
      generation_row.id,
      1,
      refunded_balance,
      'generation_refund',
      pg_catalog.jsonb_build_object('error_code', p_error_code)
    );
  end if;

  if generation_row.project_id is not null
     and not exists (
       select 1
       from public.commerce_generations as generation
       where generation.project_id = generation_row.project_id
         and generation.id <> p_generation_id
         and generation.status in ('queued', 'processing')
     ) then
    update public.commerce_project_assets
    set state = 'ready'
    where project_id = generation_row.project_id
      and user_id = generation_row.user_id
      and state = 'processing';
  end if;
end;
$$;

create or replace function public.reconcile_terminal_commerce_assets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_row record;
  updated_count integer;
  restored_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  for project_row in
    select project.id
    from public.commerce_projects as project
    where exists (
      select 1
      from public.commerce_project_assets as asset
      where asset.project_id = project.id
        and asset.state = 'processing'
    )
    order by project.id
    for update
  loop
    if not exists (
      select 1
      from public.commerce_generations as generation
      where generation.project_id = project_row.id
        and generation.status in ('queued', 'processing')
    ) then
      update public.commerce_project_assets
      set state = 'ready'
      where project_id = project_row.id
        and state = 'processing';
      get diagnostics updated_count = row_count;
      restored_count := restored_count + updated_count;
    end if;
  end loop;

  return restored_count;
end;
$$;

create or replace function public.list_abandoned_commerce_uploads(
  p_cutoff timestamptz,
  p_after_id uuid,
  p_limit integer
)
returns table (
  id uuid,
  project_id uuid,
  user_id uuid,
  storage_path text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cursor_created_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_cutoff is null then
    raise exception 'upload cutoff required' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'invalid upload page limit' using errcode = '22023';
  end if;

  if p_after_id is not null then
    select asset.created_at
    into cursor_created_at
    from public.commerce_project_assets as asset
    where asset.id = p_after_id;
    if not found then
      raise exception 'upload cursor not found' using errcode = 'P0002';
    end if;
  end if;

  return query
  select asset.id, asset.project_id, asset.user_id, asset.storage_path, asset.created_at
  from public.commerce_project_assets as asset
  where asset.state in ('uploading', 'validating')
    and coalesce(asset.validation_started_at, asset.created_at) < p_cutoff
    and (
      p_after_id is null
      or (asset.created_at, asset.id) > (cursor_created_at, p_after_id)
    )
  order by asset.created_at, asset.id
  limit p_limit;
end;
$$;

create or replace function public.list_orphan_commerce_storage_objects(
  p_after_name text,
  p_limit integer
)
returns table (storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'invalid orphan page limit' using errcode = '22023';
  end if;

  return query
  select object.name
  from storage.objects as object
  left join public.commerce_project_assets as asset
    on asset.storage_path = object.name
  where object.bucket_id = 'commerce-assets'
    and asset.id is null
    and (p_after_name is null or object.name > p_after_name)
  order by object.name
  limit p_limit;
end;
$$;

revoke all on function public.reserve_commerce_asset(uuid, text, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_commerce_asset_upload_validation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.release_commerce_asset_upload_validation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_commerce_asset_upload(uuid, uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_commerce_asset_upload(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_commerce_generation(uuid, jsonb, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_commerce_generation(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_terminal_commerce_assets()
  from public, anon, authenticated, service_role;
revoke all on function public.list_abandoned_commerce_uploads(timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.list_orphan_commerce_storage_objects(text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.reserve_commerce_asset(uuid, text, text, bigint) to authenticated;
grant execute on function public.claim_commerce_asset_upload_validation(uuid, uuid, uuid) to service_role;
grant execute on function public.release_commerce_asset_upload_validation(uuid, uuid, uuid) to service_role;
grant execute on function public.finalize_commerce_asset_upload(uuid, uuid, uuid, text, bigint) to service_role;
grant execute on function public.fail_commerce_asset_upload(uuid, uuid, uuid) to service_role;
grant execute on function public.complete_commerce_generation(uuid, jsonb, text, text, jsonb) to service_role;
grant execute on function public.fail_commerce_generation(uuid, text, text) to service_role;
grant execute on function public.reconcile_terminal_commerce_assets() to service_role;
grant execute on function public.list_abandoned_commerce_uploads(timestamptz, uuid, integer) to service_role;
grant execute on function public.list_orphan_commerce_storage_objects(text, integer) to service_role;
