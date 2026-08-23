-- AI 电商工作台：私有项目数据、原子额度、后台权限和 Storage 策略。
-- 所有浏览器可调用的高权限函数都固定 search_path，并在函数内部重新校验身份。

create extension if not exists pgcrypto;

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key check (key in (
    'new_user_credits',
    'default_daily_limit',
    'max_project_images',
    'storage_soft_limit_bytes',
    'storage_target_bytes'
  )),
  value jsonb not null check (jsonb_typeof(value) = 'number'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 3 check (credits >= 0),
  unlimited boolean not null default false,
  disabled boolean not null default false,
  daily_limit integer not null default 10 check (daily_limit between 1 and 1000),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  platform text not null check (platform in ('ozon','wildberries','douyin','taobao-tmall')),
  mode text not null check (mode in ('quick','professional')),
  input_data jsonb not null default '{}'::jsonb check (jsonb_typeof(input_data) = 'object'),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.commerce_project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.commerce_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 8388608),
  expires_at timestamptz not null default (now() + interval '7 days'),
  state text not null default 'ready' check (state in ('uploading','ready','processing','deleted','failed')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint commerce_project_assets_project_owner_fkey
    foreign key (project_id, user_id)
    references public.commerce_projects(id, user_id)
    on delete cascade,
  check ((state = 'deleted' and deleted_at is not null) or state <> 'deleted')
);

create table if not exists public.commerce_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.commerce_projects(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  result_data jsonb check (result_data is null or jsonb_typeof(result_data) = 'object'),
  provider text,
  model text,
  usage jsonb check (usage is null or jsonb_typeof(usage) = 'object'),
  error_code text,
  error_message text,
  credit_charged boolean not null default false,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (user_id, idempotency_key),
  check ((status = 'completed' and result_data is not null) or status <> 'completed')
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.commerce_generations(id) on delete set null,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (reason in ('signup_grant','generation','generation_refund','admin_adjustment')),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.platform_presets (
  platform text primary key check (platform in ('ozon','wildberries','douyin','taobao-tmall')),
  display_name text not null,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running','completed','partial','failed')),
  trigger_reason text not null check (trigger_reason in ('scheduled','soft_limit','manual')),
  assets_examined integer not null default 0 check (assets_examined >= 0),
  assets_deleted integer not null default 0 check (assets_deleted >= 0),
  bytes_before bigint not null default 0 check (bytes_before >= 0),
  bytes_deleted bigint not null default 0 check (bytes_deleted >= 0),
  bytes_after bigint not null default 0 check (bytes_after >= 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(btrim(action)) between 1 and 100),
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists commerce_projects_user_created_idx
  on public.commerce_projects(user_id, created_at desc);
create index if not exists commerce_project_assets_project_idx
  on public.commerce_project_assets(project_id, created_at);
create index if not exists commerce_project_assets_cleanup_idx
  on public.commerce_project_assets(state, expires_at, created_at);
create index if not exists commerce_generations_user_created_idx
  on public.commerce_generations(user_id, created_at desc);
create index if not exists commerce_generations_project_idx
  on public.commerce_generations(project_id)
  where project_id is not null;
create index if not exists commerce_generations_status_created_idx
  on public.commerce_generations(status, created_at);
create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger(user_id, created_at desc);
create unique index if not exists credit_ledger_signup_grant_user_idx
  on public.credit_ledger(user_id)
  where reason = 'signup_grant';
create unique index if not exists credit_ledger_generation_reason_idx
  on public.credit_ledger(generation_id, reason)
  where generation_id is not null
    and reason in ('generation', 'generation_refund');
create index if not exists cleanup_runs_started_idx
  on public.cleanup_runs(started_at desc);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

insert into public.app_settings (key, value)
values
  ('new_user_credits', '3'::jsonb),
  ('default_daily_limit', '10'::jsonb),
  ('max_project_images', '6'::jsonb),
  ('storage_soft_limit_bytes', '800000000'::jsonb),
  ('storage_target_bytes', '650000000'::jsonb)
on conflict (key) do nothing;

insert into public.platform_presets (platform, display_name, config)
values
  (
    'ozon',
    'Ozon',
    '{"market":"ru","copy_language":"ru","explanation_language":"zh-CN","focus":["clear-benefits","trust","mobile-legibility"]}'::jsonb
  ),
  (
    'wildberries',
    'Wildberries',
    '{"market":"ru","copy_language":"ru","explanation_language":"zh-CN","focus":["fast-scanning","dense-benefits","mobile-legibility"]}'::jsonb
  ),
  (
    'douyin',
    '抖音电商',
    '{"market":"cn","copy_language":"zh-CN","explanation_language":"zh-CN","focus":["strong-hook","scene-driven","conversion"]}'::jsonb
  ),
  (
    'taobao-tmall',
    '淘宝 / 天猫',
    '{"market":"cn","copy_language":"zh-CN","explanation_language":"zh-CN","focus":["brand-consistency","detail-density","trust"]}'::jsonb
  )
on conflict (platform) do nothing;

-- 现有留言板站长自动获得全站管理员身份；重复执行不会重复插入。
insert into public.site_admins (user_id)
select guestbook_admin.user_id
from public.guestbook_admins as guestbook_admin
on conflict (user_id) do nothing;

create or replace function public.handle_new_commerce_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_credits integer;
  initial_daily_limit integer;
  inserted_credits integer;
begin
  select coalesce(
    (select (setting.value #>> '{}')::integer
     from public.app_settings as setting
     where setting.key = 'new_user_credits'),
    3
  ) into initial_credits;

  select coalesce(
    (select (setting.value #>> '{}')::integer
     from public.app_settings as setting
     where setting.key = 'default_daily_limit'),
    10
  ) into initial_daily_limit;

  insert into public.user_entitlements (user_id, credits, daily_limit)
  values (new.id, initial_credits, initial_daily_limit)
  on conflict (user_id) do nothing
  returning credits into inserted_credits;

  if inserted_credits is not null then
    insert into public.credit_ledger (user_id, delta, balance_after, reason, metadata)
    values (
      new.id,
      inserted_credits,
      inserted_credits,
      'signup_grant',
      '{"source":"auth_trigger"}'::jsonb
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_initialize_commerce on auth.users;
create trigger on_auth_user_created_initialize_commerce
after insert on auth.users
for each row execute function public.handle_new_commerce_user();

-- 先安装触发器再回填，避免迁移期间新建 auth 用户落入两者之间的空窗。
-- 现有 auth 用户获得初始 entitlement 和恰好一条 signup_grant 流水。
with defaults as (
  select
    coalesce((select (setting.value #>> '{}')::integer from public.app_settings as setting where setting.key = 'new_user_credits'), 3) as credits,
    coalesce((select (setting.value #>> '{}')::integer from public.app_settings as setting where setting.key = 'default_daily_limit'), 10) as daily_limit
), inserted_entitlements as (
  insert into public.user_entitlements (user_id, credits, daily_limit)
  select auth_user.id, defaults.credits, defaults.daily_limit
  from auth.users as auth_user
  cross join defaults
  on conflict (user_id) do nothing
  returning user_id, credits
)
insert into public.credit_ledger (user_id, delta, balance_after, reason, metadata)
select
  inserted.user_id,
  inserted.credits,
  inserted.credits,
  'signup_grant',
  '{"source":"migration_backfill"}'::jsonb
from inserted_entitlements as inserted
on conflict do nothing;

create or replace function public.site_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
    and exists (
      select 1
      from public.site_admins as site_admin
      where site_admin.user_id = (select auth.uid())
    );
$$;

create or replace function public.get_my_entitlement()
returns table (
  user_id uuid,
  credits integer,
  unlimited boolean,
  disabled boolean,
  daily_limit integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = current_user_id
      and not coalesce(auth_user.is_anonymous, false)
  ) then
    raise exception 'commerce authentication required' using errcode = '28000';
  end if;

  return query
  select
    entitlement.user_id,
    entitlement.credits,
    entitlement.unlimited,
    entitlement.disabled,
    entitlement.daily_limit,
    entitlement.updated_at
  from public.user_entitlements as entitlement
  where entitlement.user_id = current_user_id;
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
    select 1
    from auth.users as auth_user
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

  if not exists (
    select 1
    from public.commerce_projects as project
    where project.id = p_project_id
      and project.user_id = current_user_id
  ) then
    raise exception 'project not found or forbidden' using errcode = 'P0002';
  end if;

  -- 稳定地由 UUID 前 8 字节构造两个 31-bit advisory lock key。
  -- 丢弃符号位只可能造成额外串行化，不会削弱事务正确性。
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

  select entitlement_row.*
  into entitlement
  from public.user_entitlements as entitlement_row
  where entitlement_row.user_id = current_user_id
  for update;

  if not found then
    raise exception 'entitlement not found' using errcode = 'P0002';
  end if;

  if entitlement.disabled then
    raise exception 'commerce account disabled' using errcode = '42501';
  end if;

  select generation.*
  into existing_generation
  from public.commerce_generations as generation
  where generation.user_id = current_user_id
    and generation.idempotency_key = normalized_key;

  if found then
    if existing_generation.project_id is distinct from p_project_id then
      raise exception 'idempotency key already used for another project' using errcode = '23505';
    end if;

    return query
    select existing_generation.id, existing_generation.status, false;
    return;
  end if;

  select pg_catalog.count(*)
  into generations_today
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
    set credits = credits - 1,
        updated_at = pg_catalog.now()
    where user_id = (select auth.uid())
      and credits > 0
    returning credits into new_balance;

    if not found then
      raise exception 'insufficient credits' using errcode = 'P0001';
    end if;
  end if;

  insert into public.commerce_generations (
    project_id,
    user_id,
    idempotency_key,
    status,
    credit_charged
  ) values (
    p_project_id,
    current_user_id,
    normalized_key,
    'queued',
    not entitlement.unlimited
  )
  returning id into new_generation_id;

  if not entitlement.unlimited then
    insert into public.credit_ledger (
      user_id,
      generation_id,
      delta,
      balance_after,
      reason,
      metadata
    ) values (
      current_user_id,
      new_generation_id,
      -1,
      new_balance,
      'generation',
      pg_catalog.jsonb_build_object('project_id', p_project_id)
    );
  end if;

  return query
  select new_generation_id, 'queued'::text, true;
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
  current_status text;
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

  select generation.status
  into current_status
  from public.commerce_generations as generation
  where generation.id = p_generation_id
  for update;

  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;
  if current_status = 'completed' then
    return;
  end if;
  if current_status in ('failed', 'cancelled') then
    raise exception 'generation can no longer complete' using errcode = '55000';
  end if;

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
  generation_row public.commerce_generations%rowtype;
  refunded_balance integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
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
end;
$$;

create or replace function public.delete_commerce_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  lock_bytes bytea;
  lock_key_one integer;
  lock_key_two integer;
begin
  if current_user_id is null or not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = current_user_id
      and not coalesce(auth_user.is_anonymous, false)
  ) then
    raise exception 'commerce authentication required' using errcode = '28000';
  end if;

  if p_project_id is null then
    raise exception 'project is required' using errcode = '22023';
  end if;

  -- 与 begin_commerce_generation 使用同一用户锁，防止生成创建与删除交错。
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

  if not exists (
    select 1
    from public.commerce_projects as project
    where project.id = p_project_id
      and project.user_id = current_user_id
  ) then
    raise exception 'project not found or forbidden' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.commerce_generations as generation
    where generation.project_id = p_project_id
      and generation.user_id = current_user_id
      and generation.status in ('queued', 'processing')
  ) then
    raise exception 'project has an active generation' using errcode = '55000';
  end if;

  delete from public.commerce_projects
  where id = p_project_id
    and user_id = current_user_id;

  if not found then
    raise exception 'project not found or forbidden' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_commerce_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  total_users bigint;
  today_generations bigint;
  today_failures bigint;
  credits_consumed bigint;
  storage_bytes bigint;
  latest_cleanup jsonb;
begin
  if not public.site_is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  select pg_catalog.count(*)
  into total_users
  from auth.users as auth_user
  where not coalesce(auth_user.is_anonymous, false);

  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where generation.status = 'failed')
  into today_generations, today_failures
  from public.commerce_generations as generation
  where generation.created_at >= (
    pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC'
  );

  select coalesce(-pg_catalog.sum(ledger.delta), 0)
  into credits_consumed
  from public.credit_ledger as ledger
  where ledger.reason = 'generation';

  select coalesce(pg_catalog.sum(asset.size_bytes), 0)
  into storage_bytes
  from public.commerce_project_assets as asset
  where asset.state in ('uploading', 'ready', 'processing');

  select pg_catalog.to_jsonb(cleanup_row)
  into latest_cleanup
  from (
    select
      cleanup.id,
      cleanup.status,
      cleanup.trigger_reason,
      cleanup.assets_deleted,
      cleanup.bytes_deleted,
      cleanup.started_at,
      cleanup.completed_at
    from public.cleanup_runs as cleanup
    order by cleanup.started_at desc
    limit 1
  ) as cleanup_row;

  return pg_catalog.jsonb_build_object(
    'total_users', total_users,
    'today_generations', today_generations,
    'today_failures', today_failures,
    'today_failure_rate', case
      when today_generations = 0 then 0
      else pg_catalog.round(today_failures::numeric * 100 / today_generations, 2)
    end,
    'credits_consumed', credits_consumed,
    'storage_bytes', storage_bytes,
    'latest_cleanup', latest_cleanup
  );
end;
$$;

create or replace function public.admin_list_users(
  p_search text,
  p_limit integer,
  p_offset integer
)
returns table (
  user_id uuid,
  email text,
  provider text,
  created_at timestamptz,
  credits integer,
  unlimited boolean,
  disabled boolean,
  daily_limit integer,
  generation_count bigint,
  credits_used bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := pg_catalog.btrim(coalesce(p_search, ''));
begin
  if not public.site_is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'offset must be non-negative' using errcode = '22023';
  end if;

  return query
  select
    auth_user.id,
    auth_user.email::text,
    coalesce(
      auth_user.raw_app_meta_data ->> 'provider',
      auth_user.raw_user_meta_data ->> 'provider',
      'unknown'
    )::text,
    auth_user.created_at,
    entitlement.credits,
    entitlement.unlimited,
    entitlement.disabled,
    entitlement.daily_limit,
    coalesce(generation_stats.generation_count, 0),
    coalesce(ledger_stats.credits_used, 0)
  from auth.users as auth_user
  join public.user_entitlements as entitlement
    on entitlement.user_id = auth_user.id
  left join lateral (
    select pg_catalog.count(*) as generation_count
    from public.commerce_generations as generation
    where generation.user_id = auth_user.id
  ) as generation_stats on true
  left join lateral (
    select coalesce(-pg_catalog.sum(ledger.delta), 0)::bigint as credits_used
    from public.credit_ledger as ledger
    where ledger.user_id = auth_user.id
      and ledger.reason = 'generation'
  ) as ledger_stats on true
  where not coalesce(auth_user.is_anonymous, false)
    and (
      normalized_search = ''
      or coalesce(auth_user.email, '') ilike '%' || normalized_search || '%'
      or auth_user.id::text ilike '%' || normalized_search || '%'
      or coalesce(auth_user.raw_app_meta_data ->> 'provider', '') ilike '%' || normalized_search || '%'
    )
  order by auth_user.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.admin_list_generations(
  p_search text,
  p_limit integer,
  p_offset integer
)
returns table (
  generation_id uuid,
  project_id uuid,
  project_name text,
  user_id uuid,
  user_email text,
  platform text,
  status text,
  provider text,
  model text,
  error_code text,
  error_message text,
  credit_charged boolean,
  refunded_at timestamptz,
  created_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := pg_catalog.btrim(coalesce(p_search, ''));
begin
  if not public.site_is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'offset must be non-negative' using errcode = '22023';
  end if;

  return query
  select
    generation.id,
    generation.project_id,
    coalesce(project.name, '已删除项目'::text),
    generation.user_id,
    auth_user.email::text,
    project.platform,
    generation.status,
    generation.provider,
    generation.model,
    generation.error_code,
    generation.error_message,
    generation.credit_charged,
    generation.refunded_at,
    generation.created_at,
    generation.started_at,
    generation.completed_at
  from public.commerce_generations as generation
  left join public.commerce_projects as project on project.id = generation.project_id
  join auth.users as auth_user on auth_user.id = generation.user_id
  where normalized_search = ''
     or coalesce(auth_user.email, '') ilike '%' || normalized_search || '%'
     or generation.id::text ilike '%' || normalized_search || '%'
     or coalesce(project.name, '已删除项目') ilike '%' || normalized_search || '%'
     or coalesce(project.platform, '') ilike '%' || normalized_search || '%'
     or generation.status ilike '%' || normalized_search || '%'
     or coalesce(generation.provider, '') ilike '%' || normalized_search || '%'
     or coalesce(generation.model, '') ilike '%' || normalized_search || '%'
     or coalesce(generation.error_code, '') ilike '%' || normalized_search || '%'
  order by generation.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.admin_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings jsonb;
begin
  if not public.site_is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.jsonb_object_agg(setting.key, setting.value), '{}'::jsonb)
  into settings
  from public.app_settings as setting
  where setting.key in (
    'new_user_credits',
    'default_daily_limit',
    'max_project_images',
    'storage_soft_limit_bytes',
    'storage_target_bytes'
  );

  return settings;
end;
$$;

create or replace function public.admin_set_entitlement(
  p_user_id uuid,
  p_credits integer,
  p_unlimited boolean,
  p_disabled boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := auth.uid();
  old_entitlement public.user_entitlements%rowtype;
  credit_delta integer;
begin
  if not public.site_is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_credits is null or p_credits not between 0 and 1000000 then
    raise exception 'credits must be between 0 and 1000000' using errcode = '22023';
  end if;
  if p_unlimited is null or p_disabled is null then
    raise exception 'unlimited and disabled are required' using errcode = '22023';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'reason must be between 1 and 500 characters' using errcode = '22023';
  end if;

  select entitlement.*
  into old_entitlement
  from public.user_entitlements as entitlement
  join auth.users as auth_user on auth_user.id = entitlement.user_id
  where entitlement.user_id = p_user_id
    and not coalesce(auth_user.is_anonymous, false)
  for update of entitlement;

  if not found then
    raise exception 'user entitlement not found' using errcode = 'P0002';
  end if;

  credit_delta := p_credits - old_entitlement.credits;

  update public.user_entitlements
  set credits = p_credits,
      unlimited = p_unlimited,
      disabled = p_disabled,
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  if credit_delta <> 0 then
    insert into public.credit_ledger (
      user_id,
      delta,
      balance_after,
      reason,
      actor_user_id,
      metadata
    ) values (
      p_user_id,
      credit_delta,
      p_credits,
      'admin_adjustment',
      current_admin_id,
      pg_catalog.jsonb_build_object('reason', pg_catalog.btrim(p_reason))
    );
  end if;

  insert into public.admin_audit_log (actor_user_id, action, target_user_id, details)
  values (
    current_admin_id,
    'set_entitlement',
    p_user_id,
    pg_catalog.jsonb_build_object(
      'reason', pg_catalog.btrim(p_reason),
      'before', pg_catalog.jsonb_build_object(
        'credits', old_entitlement.credits,
        'unlimited', old_entitlement.unlimited,
        'disabled', old_entitlement.disabled
      ),
      'after', pg_catalog.jsonb_build_object(
        'credits', p_credits,
        'unlimited', p_unlimited,
        'disabled', p_disabled
      )
    )
  );
end;
$$;

create or replace function public.admin_update_settings(
  p_settings jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := auth.uid();
  old_settings jsonb;
  merged_settings jsonb;
  new_user_credits integer;
  default_daily_limit integer;
  max_project_images integer;
  storage_soft_limit_bytes bigint;
  storage_target_bytes bigint;
begin
  if not public.site_is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_settings is null or pg_catalog.jsonb_typeof(p_settings) <> 'object' then
    raise exception 'settings must be a JSON object' using errcode = '22023';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'reason must be between 1 and 500 characters' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_settings) as requested_key(key)
    where requested_key.key not in (
      'new_user_credits',
      'default_daily_limit',
      'max_project_images',
      'storage_soft_limit_bytes',
      'storage_target_bytes'
    )
  ) then
    raise exception 'unknown application setting' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_each(p_settings) as requested_setting(key, value)
    where pg_catalog.jsonb_typeof(requested_setting.value) <> 'number'
  ) then
    raise exception 'setting values must be JSON numbers' using errcode = '22023';
  end if;

  -- 锁住五个设置行，避免两个管理员的并发局部更新破坏目标水位约束。
  perform 1
  from public.app_settings as setting
  where setting.key in (
    'new_user_credits',
    'default_daily_limit',
    'max_project_images',
    'storage_soft_limit_bytes',
    'storage_target_bytes'
  )
  for update;

  select coalesce(pg_catalog.jsonb_object_agg(setting.key, setting.value), '{}'::jsonb)
  into old_settings
  from public.app_settings as setting
  where setting.key in (
    'new_user_credits',
    'default_daily_limit',
    'max_project_images',
    'storage_soft_limit_bytes',
    'storage_target_bytes'
  );

  merged_settings := old_settings || p_settings;

  if merged_settings -> 'new_user_credits' is null
     or merged_settings -> 'default_daily_limit' is null
     or merged_settings -> 'max_project_images' is null
     or merged_settings -> 'storage_soft_limit_bytes' is null
     or merged_settings -> 'storage_target_bytes' is null then
    raise exception 'all five application settings must exist' using errcode = '22023';
  end if;

  begin
    new_user_credits := (merged_settings ->> 'new_user_credits')::integer;
    default_daily_limit := (merged_settings ->> 'default_daily_limit')::integer;
    max_project_images := (merged_settings ->> 'max_project_images')::integer;
    storage_soft_limit_bytes := (merged_settings ->> 'storage_soft_limit_bytes')::bigint;
    storage_target_bytes := (merged_settings ->> 'storage_target_bytes')::bigint;
  exception when others then
    raise exception 'setting values must be integers' using errcode = '22023';
  end;

  if new_user_credits is null
     or default_daily_limit is null
     or max_project_images is null
     or storage_soft_limit_bytes is null
     or storage_target_bytes is null then
    raise exception 'all five application settings must be non-null integers' using errcode = '22023';
  end if;

  if new_user_credits not between 1 and 1000000 then
    raise exception 'new_user_credits must be between 1 and 1000000' using errcode = '22023';
  end if;
  if default_daily_limit not between 1 and 1000 then
    raise exception 'default_daily_limit must be between 1 and 1000' using errcode = '22023';
  end if;
  if max_project_images not between 1 and 6 then
    raise exception 'max_project_images must be between 1 and 6' using errcode = '22023';
  end if;
  if storage_soft_limit_bytes < 1 or storage_target_bytes < 1 then
    raise exception 'storage limits must be positive' using errcode = '22023';
  end if;
  if storage_target_bytes >= storage_soft_limit_bytes then
    raise exception 'storage_target_bytes must be below storage_soft_limit_bytes' using errcode = '22023';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  select requested_setting.key, requested_setting.value, pg_catalog.now(), current_admin_id
  from pg_catalog.jsonb_each(p_settings) as requested_setting(key, value)
  on conflict (key) do update
  set value = excluded.value,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  insert into public.admin_audit_log (actor_user_id, action, details)
  values (
    current_admin_id,
    'update_commerce_settings',
    pg_catalog.jsonb_build_object(
      'reason', pg_catalog.btrim(p_reason),
      'before', old_settings,
      'after', merged_settings,
      'changes', p_settings
    )
  );
end;
$$;

alter table public.site_admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.commerce_projects enable row level security;
alter table public.commerce_project_assets enable row level security;
alter table public.commerce_generations enable row level security;
alter table public.platform_presets enable row level security;
alter table public.cleanup_runs enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.site_admins from public, anon, authenticated;
revoke all on public.app_settings from public, anon, authenticated;
revoke all on public.user_entitlements from public, anon, authenticated;
revoke all on public.credit_ledger from public, anon, authenticated;
revoke all on public.commerce_projects from public, anon, authenticated;
revoke all on public.commerce_project_assets from public, anon, authenticated;
revoke all on public.commerce_generations from public, anon, authenticated;
revoke all on public.platform_presets from public, anon, authenticated;
revoke all on public.cleanup_runs from public, anon, authenticated;
revoke all on public.admin_audit_log from public, anon, authenticated;

revoke all on public.site_admins from service_role;
revoke all on public.app_settings from service_role;
revoke all on public.user_entitlements from service_role;
revoke all on public.credit_ledger from service_role;
revoke all on public.commerce_projects from service_role;
revoke all on public.commerce_project_assets from service_role;
revoke all on public.commerce_generations from service_role;
revoke all on public.platform_presets from service_role;
revoke all on public.cleanup_runs from service_role;
revoke all on public.admin_audit_log from service_role;

grant select on public.user_entitlements to authenticated;
grant select on public.credit_ledger to authenticated;
grant select, insert, update on public.commerce_projects to authenticated;
grant select, insert, update, delete on public.commerce_project_assets to authenticated;
grant select on public.commerce_generations to authenticated;
grant select on public.platform_presets to authenticated;

grant select on public.app_settings to service_role;
grant select on public.commerce_projects to service_role;
grant select on public.commerce_project_assets to service_role;
grant update (state, deleted_at) on public.commerce_project_assets to service_role;
grant select on public.commerce_generations to service_role;
grant select on public.platform_presets to service_role;
grant insert on public.cleanup_runs to service_role;

drop policy if exists "commerce_entitlements_select_own" on public.user_entitlements;
create policy "commerce_entitlements_select_own"
on public.user_entitlements for select to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_credit_ledger_select_own" on public.credit_ledger;
create policy "commerce_credit_ledger_select_own"
on public.credit_ledger for select to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_projects_select_own" on public.commerce_projects;
create policy "commerce_projects_select_own"
on public.commerce_projects for select to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_projects_insert_own" on public.commerce_projects;
create policy "commerce_projects_insert_own"
on public.commerce_projects for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_projects_update_own" on public.commerce_projects;
create policy "commerce_projects_update_own"
on public.commerce_projects for update to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
)
with check (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_assets_select_own" on public.commerce_project_assets;
create policy "commerce_assets_select_own"
on public.commerce_project_assets for select to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_assets_insert_own" on public.commerce_project_assets;
create policy "commerce_assets_insert_own"
on public.commerce_project_assets for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (storage.foldername(storage_path))[1] = (select auth.uid())::text
  and (storage.foldername(storage_path))[2] = project_id::text
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_assets_update_own" on public.commerce_project_assets;
create policy "commerce_assets_update_own"
on public.commerce_project_assets for update to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
)
with check (
  (select auth.uid()) = user_id
  and (storage.foldername(storage_path))[1] = (select auth.uid())::text
  and (storage.foldername(storage_path))[2] = project_id::text
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_assets_delete_own" on public.commerce_project_assets;
create policy "commerce_assets_delete_own"
on public.commerce_project_assets for delete to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_generations_select_own" on public.commerce_generations;
create policy "commerce_generations_select_own"
on public.commerce_generations for select to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_platform_presets_select_authenticated" on public.platform_presets;
create policy "commerce_platform_presets_select_authenticated"
on public.platform_presets for select to authenticated
using (not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('commerce-assets', 'commerce-assets', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "commerce_storage_insert_own" on storage.objects;
create policy "commerce_storage_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'commerce-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_storage_select_own" on storage.objects;
create policy "commerce_storage_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'commerce-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

drop policy if exists "commerce_storage_delete_own" on storage.objects;
create policy "commerce_storage_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'commerce-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
);

revoke all on function public.handle_new_commerce_user() from public, anon, authenticated, service_role;
revoke all on function public.site_is_admin() from public, anon, authenticated, service_role;
revoke all on function public.get_my_entitlement() from public, anon, authenticated, service_role;
revoke all on function public.begin_commerce_generation(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.complete_commerce_generation(uuid, jsonb, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.fail_commerce_generation(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_commerce_project(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_commerce_overview() from public, anon, authenticated, service_role;
revoke all on function public.admin_list_users(text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_list_generations(text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_settings() from public, anon, authenticated, service_role;
revoke all on function public.admin_set_entitlement(uuid, integer, boolean, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_settings(jsonb, text) from public, anon, authenticated, service_role;

grant execute on function public.site_is_admin() to authenticated;
grant execute on function public.get_my_entitlement() to authenticated;
grant execute on function public.begin_commerce_generation(uuid, text) to authenticated;
grant execute on function public.delete_commerce_project(uuid) to authenticated;
grant execute on function public.admin_commerce_overview() to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_list_generations(text, integer, integer) to authenticated;
grant execute on function public.admin_get_settings() to authenticated;
grant execute on function public.admin_set_entitlement(uuid, integer, boolean, boolean, text) to authenticated;
grant execute on function public.admin_update_settings(jsonb, text) to authenticated;

grant execute on function public.complete_commerce_generation(uuid, jsonb, text, text, jsonb) to service_role;
grant execute on function public.fail_commerce_generation(uuid, text, text) to service_role;
