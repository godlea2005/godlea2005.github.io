-- 文昊个人网站留言板：共享消息、匿名身份、站长权限与图片策略。
-- 在 Supabase SQL Editor 中整段运行。本迁移不会写入任何密钥。

create extension if not exists pgcrypto;

create table if not exists public.guestbook_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 24),
  email text,
  website text check (website is null or website = '' or website ~* '^https?://'),
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.guestbook_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.guestbook_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  author_snapshot text not null check (char_length(btrim(author_snapshot)) between 1 and 24),
  website_snapshot text check (website_snapshot is null or website_snapshot = '' or website_snapshot ~* '^https?://'),
  content text not null check (char_length(btrim(content)) between 1 and 300),
  image_path text,
  reply_to uuid references public.guestbook_messages(id) on delete set null,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  client_browser text not null default 'Browser',
  client_platform text not null default 'Web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guestbook_messages_created_at_idx on public.guestbook_messages(created_at);
create index if not exists guestbook_messages_status_idx on public.guestbook_messages(status, created_at);
create index if not exists guestbook_messages_user_id_idx on public.guestbook_messages(user_id);

alter table public.guestbook_profiles enable row level security;
alter table public.guestbook_admins enable row level security;
alter table public.guestbook_messages enable row level security;

revoke all on public.guestbook_profiles from anon, authenticated;
revoke all on public.guestbook_admins from anon, authenticated;
revoke all on public.guestbook_messages from anon, authenticated;

drop policy if exists "profiles_select_own" on public.guestbook_profiles;
create policy "profiles_select_own"
on public.guestbook_profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "profiles_insert_own" on public.guestbook_profiles;
create policy "profiles_insert_own"
on public.guestbook_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_update_own" on public.guestbook_profiles;
create policy "profiles_update_own"
on public.guestbook_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.guestbook_profiles to authenticated;

create or replace function public.guestbook_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.guestbook_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.list_guestbook_messages()
returns table (
  id uuid,
  author text,
  website text,
  content text,
  image_path text,
  created_at timestamptz,
  reply_to uuid,
  status text,
  client_browser text,
  client_platform text,
  is_owner boolean,
  can_manage boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    message.id,
    coalesce(profile.nickname, message.author_snapshot),
    coalesce(profile.website, message.website_snapshot),
    message.content,
    message.image_path,
    message.created_at,
    message.reply_to,
    message.status,
    message.client_browser,
    message.client_platform,
    exists (select 1 from public.guestbook_admins admin where admin.user_id = message.user_id),
    message.user_id = (select auth.uid()) or public.guestbook_is_admin()
  from public.guestbook_messages message
  left join public.guestbook_profiles profile on profile.user_id = message.user_id
  where message.status = 'approved'
     or message.user_id = (select auth.uid())
     or public.guestbook_is_admin()
  order by message.created_at asc;
$$;

create or replace function public.create_guestbook_message(
  p_author text,
  p_website text,
  p_content text,
  p_image_path text default null,
  p_reply_to uuid default null,
  p_client_browser text default 'Browser',
  p_client_platform text default 'Web'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if char_length(btrim(p_author)) not between 1 and 24 then
    raise exception 'invalid author';
  end if;
  if char_length(btrim(p_content)) not between 1 and 300 then
    raise exception 'invalid content';
  end if;
  if nullif(btrim(coalesce(p_website, '')), '') is not null and p_website !~* '^https?://' then
    raise exception 'invalid website';
  end if;
  if p_image_path is not null and p_image_path not like current_user_id::text || '/%' then
    raise exception 'invalid image path';
  end if;

  insert into public.guestbook_messages (
    user_id, author_snapshot, website_snapshot, content, image_path, reply_to,
    client_browser, client_platform, status
  ) values (
    current_user_id, btrim(p_author), nullif(btrim(coalesce(p_website, '')), ''),
    btrim(p_content), p_image_path, p_reply_to,
    left(coalesce(p_client_browser, 'Browser'), 40),
    left(coalesce(p_client_platform, 'Web'), 40),
    'approved'
  ) returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.update_guestbook_message(
  p_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(p_content)) not between 1 and 300 then
    raise exception 'invalid content';
  end if;

  update public.guestbook_messages
  set content = btrim(p_content), updated_at = now()
  where id = p_id
    and (user_id = auth.uid() or public.guestbook_is_admin());

  if not found then raise exception 'message not found or forbidden'; end if;
end;
$$;

create or replace function public.delete_guestbook_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.guestbook_messages
  where id = p_id
    and (user_id = auth.uid() or public.guestbook_is_admin());

  if not found then raise exception 'message not found or forbidden'; end if;
end;
$$;

create or replace function public.moderate_guestbook_message(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.guestbook_is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'invalid status'; end if;

  update public.guestbook_messages
  set status = p_status, updated_at = now()
  where id = p_id;
end;
$$;

revoke all on function public.guestbook_is_admin() from public, anon;
revoke all on function public.list_guestbook_messages() from public, anon;
revoke all on function public.create_guestbook_message(text, text, text, text, uuid, text, text) from public, anon;
revoke all on function public.update_guestbook_message(uuid, text) from public, anon;
revoke all on function public.delete_guestbook_message(uuid) from public, anon;
revoke all on function public.moderate_guestbook_message(uuid, text) from public, anon;

grant execute on function public.guestbook_is_admin() to authenticated;
grant execute on function public.list_guestbook_messages() to authenticated;
grant execute on function public.create_guestbook_message(text, text, text, text, uuid, text, text) to authenticated;
grant execute on function public.update_guestbook_message(uuid, text) to authenticated;
grant execute on function public.delete_guestbook_message(uuid) to authenticated;
grant execute on function public.moderate_guestbook_message(uuid, text) to authenticated;

-- 在 Storage 面板创建 public bucket：guestbook-images
-- 文件大小限制 600 KB；允许 image/jpeg、image/png、image/webp、image/gif。
drop policy if exists "guestbook_images_insert_own" on storage.objects;
create policy "guestbook_images_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'guestbook-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "guestbook_images_update_own" on storage.objects;
create policy "guestbook_images_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'guestbook-images'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'guestbook-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "guestbook_images_delete_own" on storage.objects;
create policy "guestbook_images_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'guestbook-images'
  and owner_id = (select auth.uid()::text)
);

-- 首次通过 GitHub 登录后，在 SQL Editor 运行下面一行并替换 UUID：
-- insert into public.guestbook_admins (user_id) values ('你的 auth.users UUID');
