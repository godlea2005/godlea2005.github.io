# 留言板 Supabase 与身份系统设计

## 目标

将现有只保存在当前浏览器的留言板升级为真实共享留言系统。访客无需主动登录即可发表和管理自己在当前浏览器中的留言；登录 GitHub 或 Google 后可跨设备恢复身份。文昊通过数据库授权成为唯一站长，任何访客都不能仅靠修改昵称冒充站长。

本阶段采用 A1：Supabase PostgreSQL、Auth、Row Level Security 和 Storage。微信登录不进入本阶段，待取得微信开放平台网站应用资质后再作为自定义 OAuth 提供方接入。

## 身份模型

### 未登录访客

- 首次打开留言页时，前端静默调用 Supabase Anonymous Sign-In，生成不可见的用户 ID，不显示强制登录弹窗。
- 访客可编辑昵称、邮箱和个人网站；这些资料保存在 `guestbook_profiles`，同时保留本地草稿缓存。
- 留言记录保存创建者 `user_id`。RLS 只允许当前用户修改或删除自己的留言。
- 匿名身份只在当前浏览器会话存储仍存在时可恢复；清除网站数据、退出匿名账号或更换设备后无法恢复。

### GitHub 与 Google 登录

- 登录入口是可选增强，不阻塞阅读和留言。
- 匿名用户点击 GitHub 或 Google 时使用 Identity Linking，把现有匿名用户升级为永久用户，保留其资料和历史留言所有权。
- 永久用户可以跨设备登录并管理自己的留言。
- GitHub 和 Google 使用 Supabase 原生 OAuth，不在前端保存 OAuth Client Secret。

### 站长

- 新建私有授权表 `guestbook_admins(user_id)`，只存文昊的 Supabase 用户 ID。
- `is_owner` 不由客户端提交，也不根据昵称、邮箱或浏览器判断；查询时由数据库根据 `auth.uid()` 与管理员表计算。
- 站长留言直接通过审核并显示“站长”；站长可审核、隐藏或删除任意留言。
- 文昊可先使用 GitHub 登录建立账号，再把 Google 身份链接到同一账号。两种方式最终对应同一个用户 ID。

## 数据模型

### `guestbook_profiles`

- `user_id uuid primary key references auth.users`
- `nickname text not null`
- `email text`
- `website text`
- `avatar_url text`
- `updated_at timestamptz`

用户只可读取和修改自己的资料。留言列表使用安全视图或数据库函数返回允许公开的昵称与头像，不公开访客邮箱。

### `guestbook_messages`

- `id uuid primary key`
- `user_id uuid not null references auth.users`
- `content text not null`
- `image_path text`
- `reply_to uuid references guestbook_messages`
- `status text check in ('pending', 'approved', 'rejected')`
- `created_at timestamptz`
- `updated_at timestamptz`

约束正文为 1–300 字；客户端不能写入 `is_owner`。普通访客首次上线阶段默认 `approved`，后续发现垃圾留言时可切换为 `pending`；站长始终可管理状态。

### 图片存储

- 使用私有或受控公开 Bucket `guestbook-images`，限制图片 MIME、单文件大小和用户目录。
- 文件路径包含用户 ID，RLS 只允许用户上传、替换或删除自己的文件。
- 数据库只保存 Storage 路径，不再保存 Base64 Data URL。

## 权限与安全

- 所有业务表启用 RLS，并显式配置 `anon`/`authenticated` 权限。
- 匿名登录用户虽然使用 `authenticated` 数据库角色，策略仍通过 JWT 的 `is_anonymous` 声明区分匿名与永久账号。
- 公共读取只返回已批准留言和公开资料字段。
- 新增、编辑和删除操作同时校验 `auth.uid()`、内容长度、所有权和留言状态。
- 启用 Supabase 推荐的 CAPTCHA 或 Cloudflare Turnstile，避免匿名账号和垃圾留言滥用。
- 前端只使用 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`；`service_role`、OAuth Client Secret 和管理员操作密钥永不进入仓库或 GitHub Pages。
- 本地 `.env.local` 必须被 `.gitignore` 排除；仓库仅提供无真实值的 `.env.example`。

## 前端架构

- 保留现有 `GuestbookRepository` 接口。
- 新增 `SupabaseGuestbookRepository`；环境变量完整时使用 Supabase，否则自动回退到现有 LocalStorage 预览。
- 新增独立 `GuestbookAuthProvider`，负责匿名会话、OAuth 回调、身份链接、退出和站长状态。
- 游客资料面板增加 GitHub、Google 登录按钮和当前身份状态；未登录访客仍可直接修改资料与留言。
- 消息气泡对自己的留言显示编辑/删除操作；站长额外显示审核操作。
- OAuth 返回后继续进入 `#guestbook`，保留草稿和音乐播放器状态。

## 用户需要完成的操作

### 第一步：Supabase 项目

1. 登录 Supabase，新建项目，建议名称 `wenhao-personal-site`。
2. 在 Project Connect 面板复制 Project URL 和 Publishable Key。
3. 只把这两项交给项目配置；不要复制或发送 Secret Key / `service_role` Key。
4. 在 Authentication 设置中开启 Anonymous Sign-Ins 和 Manual Identity Linking。
5. Site URL 设置为 `https://geniusli.cn`。
6. Redirect URLs 添加精确生产地址 `https://geniusli.cn/`，并为本地开发添加 `http://127.0.0.1:5173/**`。

### 第二步：GitHub OAuth

1. 在 GitHub Developer Settings 创建 OAuth App。
2. Homepage URL 使用 `https://geniusli.cn`。
3. Authorization callback URL 使用 Supabase GitHub Provider 页面显示的 `https://<project-ref>.supabase.co/auth/v1/callback`。
4. 将 GitHub Client ID 和 Client Secret 填入 Supabase GitHub Provider；Secret 不写入前端项目。

### 第三步：Google OAuth

1. 在 Google Auth Platform 创建 Web OAuth Client。
2. Authorized JavaScript origin 添加 `https://geniusli.cn`。
3. Authorized redirect URI 使用 Supabase Google Provider 页面显示的回调地址。
4. 将 Google Client ID 和 Client Secret 填入 Supabase Google Provider。

## 实施顺序

1. 添加 Supabase 客户端与环境变量回退机制。
2. 提供数据库迁移 SQL、RLS、公开读取函数和 Storage 策略。
3. 实现匿名会话、资料同步和真实留言 Repository。
4. 实现留言编辑、删除、站长状态与审核能力。
5. 接入 GitHub OAuth 并建立文昊管理员记录。
6. 接入 Google OAuth，并与同一个站长账号链接。
7. 完成跨浏览器、匿名身份、OAuth 回调、RLS 越权和图片上传测试。

## 错误与降级

- 未配置 Supabase 环境变量时继续使用 LocalStorage，不阻断当前本地预览。
- Supabase 网络不可用时显示非阻塞连接提示，保留未发送草稿，不伪装成发送成功。
- OAuth 失败后返回留言页并显示可理解的错误，不清除匿名资料和草稿。
- 身份链接冲突时不自动合并账号，保留原身份并提示重新选择已有账号登录。
- 图片上传失败不影响纯文本留言；数据库写入失败时清理本次未引用的上传文件。

## 验收标准

- 不点登录按钮的访客可以修改资料、发表留言，并在同一浏览器编辑或删除自己的留言。
- 两个不同浏览器可看到相同的已批准留言，但不能修改彼此的数据。
- GitHub、Google 登录后可跨设备恢复账号；匿名留言升级后所有权不丢失。
- 文昊登录后显示站长身份、站长气泡和审核操作；普通用户无法伪造站长状态。
- 访客邮箱、OAuth Secret、Service Role Key 不出现在公开 API 响应、构建产物或 Git 历史中。
- LocalStorage 降级、深浅主题、手机与桌面布局和全局音乐状态继续可用。
- 生产构建、真实浏览器核心流程和数据库越权测试全部通过。

## 暂不实施

- 微信登录、短信登录、独立管理后台和自建服务器。
- 微信登录待取得开放平台网站应用 AppID/Secret 后，另行设计自定义 OAuth 或认证桥接层。
