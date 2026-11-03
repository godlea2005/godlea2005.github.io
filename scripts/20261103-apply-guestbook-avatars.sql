-- One explicitly approved remote change. No other pending migration is executed.
begin;
do $guard$
begin
  if to_regprocedure('public.list_guestbook_messages_with_avatars()') is not null then
    raise exception 'Avatar RPC already exists; refusing overwrite';
  end if;
  if md5(pg_get_functiondef('public.list_guestbook_messages()'::regprocedure)) <> '3c48cc14dcf83d1bc8be92873b9a3343' then
    raise exception 'Original guestbook RPC changed; aborting';
  end if;
end
$guard$;

create or replace function public.list_guestbook_messages_with_avatars()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    to_jsonb(visible) || jsonb_build_object('avatar_url',
      case when account.is_anonymous is not true then
        coalesce(nullif(account.raw_user_meta_data->>'avatar_url', ''),
                 nullif(account.raw_user_meta_data->>'picture', ''))
      else null end)
    order by visible.created_at, visible.id
  ), '[]'::jsonb)
  from public.list_guestbook_messages() visible
  join public.guestbook_messages message on message.id = visible.id
  left join auth.users account on account.id = message.user_id;
$$;
revoke all on function public.list_guestbook_messages_with_avatars() from public, anon;
grant execute on function public.list_guestbook_messages_with_avatars() to authenticated;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('202611030001', 'guestbook_account_avatars', array[
  pg_get_functiondef('public.list_guestbook_messages_with_avatars()'::regprocedure),
  'revoke all on function public.list_guestbook_messages_with_avatars() from public, anon;',
  'grant execute on function public.list_guestbook_messages_with_avatars() to authenticated;'
]);
commit;
