# AI 电商设计工作台运维手册

本手册只记录可公开的名称和占位符。不要把 OpenAI 密钥、Supabase secret/service-role key 或清理共享密钥写入仓库、前端变量、工单或聊天。

## 1. 发布前准备

- 本地安装 Node.js 22、npm、Git 与 Supabase CLI；先运行 `node --version`、`npm --version`、`git status --short`、`npx.cmd supabase --version`。
- 使用有权访问目标项目的账号执行 `npx.cmd supabase login`。不要在共享终端记录访问令牌。
- 确认工作区无意外改动，并记录待发布 Git commit。数据库、函数和 Pages 分开发布，任一步失败都停止后续步骤。

## 2. 数据库迁移

AI 电商迁移必须按时间戳顺序应用：

1. `202608210001_ai_commerce.sql`
2. `202608290001_admin_entitlement_daily_limit.sql`
3. `202608300001_commerce_cleanup_lease.sql`
4. `202608300002_commerce_cleanup_claim.sql`
5. `202608300003_commerce_cleanup_recovery.sql`

先核对项目引用，再链接和预演：

```powershell
npx.cmd supabase link --project-ref <PROJECT_REF>
npx.cmd supabase migration list --linked
npx.cmd supabase db push --dry-run
```

确认预演仅包含上述待应用文件、已完成备份并选定维护窗口后，才由发布负责人执行 `npx.cmd supabase db push`。迁移上线后不承诺破坏性的 down migration；回退采用新的、时间戳更晚的前向修复迁移。

## 3. 站点管理员

先在 Authentication 用户列表确认目标是已认证用户，并复制其 UUID。添加前后均检查结果：

```sql
select user_id, created_at from public.site_admins where user_id = '<AUTH_USER_UUID>'::uuid;
insert into public.site_admins (user_id) values ('<AUTH_USER_UUID>'::uuid) on conflict (user_id) do nothing;
select user_id, created_at from public.site_admins where user_id = '<AUTH_USER_UUID>'::uuid;
```

移除管理员前确认不是最后一个可用站长，使用事务和单一 UUID，核对 `returning` 后再提交；结果不符立即 `rollback`：

```sql
begin;
delete from public.site_admins where user_id = '<AUTH_USER_UUID>'::uuid returning user_id;
-- 仅在返回值与目标完全一致时执行 commit；否则执行 rollback。
```

## 4. Edge Functions 与服务端配置

函数部署命令：

```powershell
npx.cmd supabase functions deploy analyze-commerce
npx.cmd supabase functions deploy cleanup-commerce-assets --no-verify-jwt
```

`cleanup-commerce-assets` 使用共享请求头鉴权，因此部署时保留 `--no-verify-jwt`；`analyze-commerce` 仍由函数内部校验用户 JWT。只在 Supabase Dashboard 的 Edge Function Secrets 配置以下名称：

- `OPENAI_API_KEY`、`OPENAI_MODEL`
- `ALLOWED_ORIGINS`
- `CLEANUP_SECRET`
- Supabase 运行时凭据：`SUPABASE_URL`，以及平台提供的 publishable/secret 凭据（当前函数优先识别 `SUPABASE_PUBLISHABLE_KEYS`、`SUPABASE_SECRET_KEYS`，也兼容单数形式与旧版 `SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`）

不要把 secret/service-role 凭据放入 GitHub Pages 或任何 `VITE_` 变量。部署后用 `npx.cmd supabase functions list` 与 Dashboard 日志核对版本和启动错误。

## 5. GitHub 配置

Repository Settings → Secrets and variables → Actions：

- Variables（公开构建值）：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`
- Secrets（清理工作流）：`SUPABASE_CLEANUP_URL`、`SUPABASE_CLEANUP_SECRET`

`deploy-pages.yml` 会先拒绝空值和 `.env.example` 占位值，再按 `npm ci` → `npm test` → `npm run build` → 上传 artifact 的顺序执行；deploy job 只依赖成功的 build。`cleanup-commerce-assets.yml` 每日运行，也支持手动触发。

## 6. 额度与账号状态

站长登录后进入 `#commerce-admin`：

- 设置页通过 `admin_update_settings` 调整新用户默认额度、默认每日上限、图片数和存储阈值，并填写审计原因。
- 用户页通过 `admin_set_entitlement` 设置剩余额度与每日上限；朋友测试账号可设为 `999` 次。
- “不限次数”对应 unlimited；“禁用”对应 disabled。两者都必须填写清晰的审计原因，不能只改数字不留原因。

后台 RPC 会写入 `admin_audit_log`；额度变化同时写入 `credit_ledger`。不要直接更新 `user_entitlements.credits`。

## 7. 诊断与巡检

优先使用后台概览与用户/生成列表（`admin_commerce_overview`、`admin_list_users`、`admin_list_generations`、`admin_get_settings`）。需要 SQL 只做只读查询：

```sql
select id, user_id, status, idempotency_key, credit_charged, refunded_at, created_at, started_at, error_code
from public.commerce_generations
where status in ('queued', 'processing', 'failed')
order by created_at desc limit 100;

select user_id, delta, balance_after, reason, generation_id, created_at
from public.credit_ledger
where user_id = '<AUTH_USER_UUID>'::uuid
order by created_at desc limit 100;

select user_id, count(*) as object_count, sum(size_bytes) as bytes,
       count(*) filter (where expires_at < now()) as expired_count
from public.commerce_project_assets
group by user_id order by bytes desc;

select id, status, trigger_reason, started_at, completed_at,
       assets_examined, assets_deleted, bytes_deleted, details
from public.cleanup_runs order by started_at desc limit 50;
```

Storage bucket `commerce-assets` 是私有桶；在 Dashboard 核对对象路径、数据库资产记录和签名访问，不要临时改成 public。

## 8. 安全退款与恢复

先查生成记录及相同 `generation_id` 的 `credit_ledger`。模型调用失败的正常路径由 `analyze-commerce` 以 service role 调用 `fail_commerce_generation`；该 RPC 根据 `credit_charged` 与 `refunded_at` 幂等地只退款一次。当前没有面向浏览器管理员的“手工退款”RPC，因此不要伪造 SQL 更新余额，也不要从前端调用 service-role RPC。

如生产出现卡住的 processing 任务，由服务端运维人员在受控脚本/函数中调用既有 `fail_commerce_generation(<GENERATION_UUID>, <ERROR_CODE>, <SAFE_MESSAGE>)`，再次查询生成记录与账本确认只有一条 `generation_refund`。清理恢复则使用既有 cleanup lease/recovery RPC 链路，不跳过 claim/finalize 状态机。

## 9. 保留与清理策略

- 默认资产保留 `7 天`。当前设置是全站共享的 `storage_soft_limit_bytes = 800000000` 与 `storage_target_bytes = 650000000`，不是每用户配额。
- 全站超过软上限时，从最旧的 ready、未过期、项目未 locked 的候选资产开始清理，直到回到 target；locked 仅阻止这条 soft_limit 提前清理路径。
- 资产超过 7 天后属于 expired；即使项目 locked 仍可清理。不要把 locked 理解为永久保留。
- 与 queued 或 processing 活动生成任务属于同一项目的资产受到数据库栅栏保护。普通“存在项目引用”本身不是永久保护条件。
- 清理函数依次取得 lease、claim 对象、删除 Storage、finalize 数据库记录；异常时释放 claim，并由 recovery 处理过期 lease。不要绕过该顺序直接批量删除桶对象。

## 10. 回滚

- 前端：保留已验证的 Git commit 与 Pages artifact；回退到 known-good commit 后重新运行完整 CI/Pages 发布，不手改线上静态文件。
- 数据库/函数：发布新的前向修复迁移或已修正的 Edge Function；不删除历史迁移，不承诺恢复已经删除的数据。涉及数据修复时先备份、预演并记录审计原因。

## 11. 发布检查表

本地可完成：

- [ ] `.env.example` 只有两个公开占位符，tracked diff 无真实凭据。
- [ ] `npm.cmd test` 全量通过，`npm.cmd run build` 通过。
- [ ] 深浅主题、390px/桌面布局、reduced motion、键盘路径与控制台错误完成本地浏览器审计。
- [ ] workflow 引用 GitHub Variables/Secrets 名称，未把服务端密钥注入前端。

生产专属门槛（本地 mock/unit 只能证明契约，不能替代）：

- [ ] 跨用户 RLS 拒绝读取/修改，非管理员调用管理员 RPC 被拒绝。
- [ ] 匿名调用 `analyze-commerce` 返回 401。
- [ ] 相同幂等键并发/重试只扣费一次。
- [ ] 模型失败只退款一次，账本余额闭合。
- [ ] 私有资产仅通过短期签名 URL 访问，跨用户签名失败。
- [ ] cleanup lease 与 recovery 在重入、部分 Storage 删除失败和 stale processing 下恢复正确。
- [ ] GitHub/Google OAuth 登录后正确回跳目标页面并恢复会话。
- [ ] 生产 Pages 冒烟：自定义域名、HTTPS、路由、Supabase 连接、函数 CORS 和移动端均正常。

未逐项通过上述生产门槛时，发布状态保持“待外部操作门槛”。
