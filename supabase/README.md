# Supabase 部署

## 可复现 CLI 部署

在仓库根目录安装/使用 Supabase CLI 后，按迁移文件顺序部署：

```powershell
npx.cmd supabase link --project-ref ujwwwqlpwdplulzslgpi
npx.cmd supabase db push
```

`db push` 会应用 `migrations/202608120001_guestbook.sql` 和
`migrations/202608210001_ai_commerce.sql`。执行前应在目标项目确认备份与
project ref；本仓库不保存数据库密码、service role key 或 OAuth Secret。

AI 电商迁移会自动完成以下工作：

- 为现有 `auth.users` 回填额度，并为每个用户写至多一条 `signup_grant` 流水；以后新用户由 `auth.users` 触发器初始化。
- 把现有 `guestbook_admins` 幂等迁移到通用 `site_admins`。
- 创建私有 `commerce-assets` bucket，限制为 JPEG/PNG/WebP、单文件 8 MiB，并按当前用户 UUID 的第一层目录授权。
- 为项目、资源、任务、额度和管理员接口启用 RLS 与最小 RPC 权限；匿名身份仍可使用留言板，但不能进入 commerce 数据或生成流程。

## AI 分析函数

`analyze-commerce` 使用 OpenAI Responses API 读取私有产品图，并严格返回主图方向、
详情页分镜和作图提示词。产品图的 signed URL 只在后台任务中生成，有效期 10 分钟，
不会返回浏览器。`verify_jwt = false` 仅用于兼容当前 publishable key；函数内部仍会
使用 Bearer token 执行 `auth.getUser()` 并拒绝匿名用户。

部署前，先在本机 PowerShell 进程中设置 `OPENAI_API_KEY`，再从仓库根目录执行：

```powershell
npx.cmd supabase secrets set "OPENAI_API_KEY=$env:OPENAI_API_KEY" "OPENAI_MODEL=gpt-5.4-mini" "ALLOWED_ORIGINS=https://geniusli.cn,http://127.0.0.1:5173"
npx.cmd supabase functions deploy analyze-commerce
```

禁止把 OpenAI 密钥写入 `.env.local`、Git、前端 `VITE_*` 变量或聊天记录。
`SUPABASE_URL` 和项目密钥由 Supabase Edge Runtime 提供。函数按以下优先级读取：

1. 新式 JSON key map 的 `default`：`SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`；
2. 新式单 key：`SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`；
3. 迁移期 legacy fallback：`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`。

Secret/service role key 只用于函数启动时构造后台数据客户端。如果该客户端无法构造，
函数不会开始接收请求，避免先扣额度再发现后台未就绪。建议在控制台切换到新式 key map，
并在上线验证后再停用 legacy keys。本次仓库更改不会自动设置 Secrets、link 项目或部署函数。

如需单独核对或修复站长迁移，可在 SQL Editor 运行同一条幂等 SQL：

```sql
insert into public.site_admins (user_id)
select user_id from public.guestbook_admins
on conflict (user_id) do nothing;
```

产品图片必须由浏览器上传到 `commerce-assets/<当前用户 UUID>/<项目 UUID>/...`。
删除项目时，客户端先依据 Storage RLS 删除该项目的全部对象；全部成功后再调用
`delete_commerce_project(uuid)` 删除数据库行。若项目仍有 `queued` / `processing`
任务，RPC 会拒绝删除；任务进入终态后可重试。项目删除后任务、结果、计费和幂等
历史继续保留，仅把任务的 `project_id` 置空。迁移不会创建公开产品图 bucket，也不会引入额外的删除 Edge Function。

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
