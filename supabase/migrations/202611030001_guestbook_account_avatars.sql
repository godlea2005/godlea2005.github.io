-- Local migration only: do not apply remotely without explicit approval.
-- Preserve the original RPC signature and its exact message visibility rules.
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
