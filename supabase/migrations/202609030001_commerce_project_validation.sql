-- Fence commerce project input behind validated RPCs and add idempotent admin refunds.

revoke insert, update, delete on public.commerce_projects from authenticated;

drop policy if exists "commerce_projects_insert_own" on public.commerce_projects;
drop policy if exists "commerce_projects_update_own" on public.commerce_projects;

create or replace function public.validate_commerce_project_input(p_input_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed_keys constant text[] := array[
    'category',
    'specifications',
    'priceRange',
    'sellingPoints',
    'audience',
    'brandTone',
    'competitorLinks',
    'prohibitedWords',
    'desiredStyle',
    'notes'
  ];
  input_entry record;
begin
  if p_input_data is null or pg_catalog.jsonb_typeof(p_input_data) <> 'object' then
    raise exception 'project input must be an object' using errcode = '22023';
  end if;

  if pg_catalog.pg_column_size(p_input_data) > 32768 then
    raise exception 'project input exceeds total size limit' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_input_data) as input_key(key)
    where not (input_key.key = any (allowed_keys))
  ) then
    raise exception 'unknown project input field' using errcode = '22023';
  end if;

  for input_entry in
    select item.key, item.value
    from pg_catalog.jsonb_each(p_input_data) as item(key, value)
  loop
    if pg_catalog.jsonb_typeof(input_entry.value) <> 'string' then
      raise exception 'project input values must be strings' using errcode = '22023';
    end if;
    if pg_catalog.char_length(input_entry.value #>> '{}') > 2000 then
      raise exception 'project input field exceeds 2000 characters' using errcode = '22023';
    end if;
  end loop;

  return p_input_data;
end;
$$;

create or replace function public.create_commerce_project(
  p_name text,
  p_platform text,
  p_mode text,
  p_input_data jsonb
)
returns setof public.commerce_projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  validated_input jsonb;
  inserted_project public.commerce_projects%rowtype;
begin
  if auth.role() is distinct from 'authenticated'
     or current_user_id is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'commerce authentication required' using errcode = '28000';
  end if;
  if p_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 80 then
    raise exception 'project name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_platform is null
     or p_platform not in ('ozon', 'wildberries', 'douyin', 'taobao-tmall') then
    raise exception 'invalid commerce platform' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('quick', 'professional') then
    raise exception 'invalid project mode' using errcode = '22023';
  end if;

  validated_input := public.validate_commerce_project_input(p_input_data);

  insert into public.commerce_projects (user_id, name, platform, mode, input_data)
  values (current_user_id, pg_catalog.btrim(p_name), p_platform, p_mode, validated_input)
  returning * into inserted_project;

  return next inserted_project;
end;
$$;

create or replace function public.update_commerce_project(
  p_project_id uuid,
  p_name text,
  p_platform text,
  p_mode text,
  p_input_data jsonb
)
returns setof public.commerce_projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  validated_input jsonb;
  updated_project public.commerce_projects%rowtype;
begin
  if auth.role() is distinct from 'authenticated'
     or current_user_id is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'commerce authentication required' using errcode = '28000';
  end if;
  if p_project_id is null then
    raise exception 'project is required' using errcode = '22023';
  end if;
  if p_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 80 then
    raise exception 'project name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_platform is null
     or p_platform not in ('ozon', 'wildberries', 'douyin', 'taobao-tmall') then
    raise exception 'invalid commerce platform' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('quick', 'professional') then
    raise exception 'invalid project mode' using errcode = '22023';
  end if;

  validated_input := public.validate_commerce_project_input(p_input_data);

  perform 1
  from public.commerce_projects as project
  where project.id = p_project_id
    and project.user_id = current_user_id
  for update;
  if not found then
    raise exception 'project not found or forbidden' using errcode = 'P0002';
  end if;

  update public.commerce_projects as project
  set name = pg_catalog.btrim(p_name),
      platform = p_platform,
      mode = p_mode,
      input_data = validated_input,
      updated_at = pg_catalog.now()
  where project.id = p_project_id
    and project.user_id = current_user_id
  returning project.* into updated_project;

  return next updated_project;
end;
$$;

create or replace function public.set_commerce_project_locked(
  p_project_id uuid,
  p_locked boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if auth.role() is distinct from 'authenticated'
     or current_user_id is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'commerce authentication required' using errcode = '28000';
  end if;
  if p_project_id is null or p_locked is null then
    raise exception 'project and locked state are required' using errcode = '22023';
  end if;

  perform 1
  from public.commerce_projects as project
  where project.id = p_project_id
    and project.user_id = current_user_id
  for update;
  if not found then
    raise exception 'project not found or forbidden' using errcode = 'P0002';
  end if;

  update public.commerce_projects as project
  set locked = p_locked,
      updated_at = pg_catalog.now()
  where project.id = p_project_id
    and project.user_id = current_user_id;
end;
$$;

create unique index if not exists credit_ledger_generation_reason_idx
  on public.credit_ledger(generation_id, reason)
  where generation_id is not null
    and reason in ('generation', 'generation_refund');

create or replace function public.admin_refund_commerce_generation(
  p_generation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := auth.uid();
  generation_row public.commerce_generations%rowtype;
  entitlement_row public.user_entitlements%rowtype;
  refunded_balance integer;
  refund_time timestamptz;
begin
  if not public.site_is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_generation_id is null then
    raise exception 'generation is required' using errcode = '22023';
  end if;
  if p_reason is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'reason must be between 1 and 500 characters' using errcode = '22023';
  end if;

  select generation.*
  into generation_row
  from public.commerce_generations as generation
  where generation.id = p_generation_id
  for update;
  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;
  if not generation_row.credit_charged then
    raise exception 'generation did not charge a credit' using errcode = '55000';
  end if;

  select entitlement.*
  into entitlement_row
  from public.user_entitlements as entitlement
  where entitlement.user_id = generation_row.user_id
  for update;
  if not found then
    raise exception 'entitlement not found for refund' using errcode = 'P0002';
  end if;

  if generation_row.refunded_at is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_refunded',
      'credits', entitlement_row.credits,
      'refundedAt', generation_row.refunded_at
    );
  end if;

  update public.user_entitlements
  set credits = credits + 1,
      updated_at = pg_catalog.now()
  where user_id = generation_row.user_id
  returning credits into refunded_balance;

  refund_time := pg_catalog.clock_timestamp();
  update public.commerce_generations as generation
  set refunded_at = refund_time
  where generation.id = generation_row.id
    and generation.refunded_at is null;
  if not found then
    raise exception 'generation refund state changed unexpectedly' using errcode = '40001';
  end if;

  insert into public.credit_ledger (
    user_id,
    generation_id,
    delta,
    balance_after,
    reason,
    actor_user_id,
    metadata
  ) values (
    generation_row.user_id,
    generation_row.id,
    1,
    refunded_balance,
    'generation_refund',
    current_admin_id,
    pg_catalog.jsonb_build_object('manual', true, 'reason', pg_catalog.btrim(p_reason))
  );

  insert into public.admin_audit_log (
    actor_user_id,
    action,
    target_user_id,
    details
  ) values (
    current_admin_id,
    'commerce_generation_refund',
    generation_row.user_id,
    pg_catalog.jsonb_build_object(
      'generation_id', generation_row.id,
      'reason', pg_catalog.btrim(p_reason),
      'balance_after', refunded_balance
    )
  );

  return pg_catalog.jsonb_build_object(
    'status', 'refunded',
    'credits', refunded_balance,
    'refundedAt', refund_time
  );
end;
$$;

revoke all on function public.validate_commerce_project_input(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.create_commerce_project(text, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.update_commerce_project(uuid, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.set_commerce_project_locked(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_refund_commerce_generation(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.create_commerce_project(text, text, text, jsonb) to authenticated;
grant execute on function public.update_commerce_project(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.set_commerce_project_locked(uuid, boolean) to authenticated;
grant execute on function public.admin_refund_commerce_generation(uuid, text) to authenticated;
