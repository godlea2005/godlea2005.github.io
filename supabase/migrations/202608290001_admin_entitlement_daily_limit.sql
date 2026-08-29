-- Compatibility upgrade for databases that deployed the original five-argument
-- administrator entitlement RPC before daily limits became editable.
do $$
begin
  if pg_catalog.to_regprocedure('public.admin_set_entitlement(uuid,integer,boolean,boolean,text)') is not null then
    execute 'revoke all on function public.admin_set_entitlement(uuid, integer, boolean, boolean, text) from public, anon, authenticated, service_role';
    execute 'drop function public.admin_set_entitlement(uuid, integer, boolean, boolean, text)';
  end if;
end
$$;

create or replace function public.admin_set_entitlement(
  p_user_id uuid,
  p_credits integer,
  p_unlimited boolean,
  p_disabled boolean,
  p_daily_limit integer,
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
  if p_daily_limit is null or p_daily_limit not between 1 and 1000 then
    raise exception 'daily limit must be between 1 and 1000' using errcode = '22023';
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
      daily_limit = p_daily_limit,
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  if credit_delta <> 0 then
    insert into public.credit_ledger (user_id, delta, balance_after, reason, actor_user_id, metadata)
    values (
      p_user_id, credit_delta, p_credits, 'admin_adjustment', current_admin_id,
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
        'disabled', old_entitlement.disabled,
        'daily_limit', old_entitlement.daily_limit
      ),
      'after', pg_catalog.jsonb_build_object(
        'credits', p_credits,
        'unlimited', p_unlimited,
        'disabled', p_disabled,
        'daily_limit', p_daily_limit
      )
    )
  );
end;
$$;

revoke all on function public.admin_set_entitlement(uuid, integer, boolean, boolean, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_entitlement(uuid, integer, boolean, boolean, integer, text) to authenticated;
