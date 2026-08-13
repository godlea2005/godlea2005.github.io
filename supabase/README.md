# Supabase 留言板部署

## 1. 执行数据库迁移

1. 打开 Supabase Dashboard → SQL Editor → New query。
2. 复制 `migrations/202608120001_guestbook.sql` 的全部内容。
3. 粘贴到 SQL Editor，点击 Run；应显示 Success，不能忽略红色错误。

迁移会创建留言、游客资料和管理员表，以及列表、新增、编辑、删除、审核 RPC 与 RLS 策略。

## 2. 开启匿名身份

在 Authentication 设置中：

- 开启 Anonymous Sign-Ins。
- 开启 Manual Identity Linking。
- Site URL 设置为 `https://geniusli.cn`。
- Redirect URLs 添加 `https://geniusli.cn/` 和 `http://127.0.0.1:5173/**`。

## 3. 创建图片 Bucket

在 Storage 新建 public bucket：

- 名称：`guestbook-images`
- 文件大小上限：600 KB
- MIME：`image/jpeg`、`image/png`、`image/webp`、`image/gif`

访问策略已由迁移创建；文件必须放在当前用户 UUID 目录下。

## 4. GitHub 登录

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App。
2. Homepage URL：`https://geniusli.cn`。
3. Callback URL：复制 Supabase → Authentication → Providers → GitHub 中显示的 Callback URL。
4. 把 GitHub Client ID 与 Client Secret 填入 Supabase 的 GitHub Provider 并启用。

## 5. 设置文昊为站长

1. 在网站留言页用 GitHub 登录。
2. 在 Supabase → Authentication → Users 找到该账号并复制 User UID。
3. 在 SQL Editor 运行：

```sql
insert into public.guestbook_admins (user_id)
values ('替换为文昊的 User UID')
on conflict (user_id) do nothing;
```

刷新留言页后应显示“站长在线”，新留言显示站长标识。

## 6. Google 登录

GitHub 和数据库验证完成后，再按照 Supabase Google Provider 指引创建 Google Web OAuth Client。使用同一邮箱时 Supabase 可自动链接身份；不同邮箱时在已经登录的资料面板中使用 Identity Linking。

## 密钥规则

- 前端只使用 Project URL 和 Publishable Key。
- `.env.local` 已被 Git 忽略。
- Secret Key、`service_role` 和 OAuth Client Secret 只放在 Supabase/GitHub/Google 控制台，禁止提交到仓库。
