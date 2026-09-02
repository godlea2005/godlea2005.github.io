# AI 电商设计工作台运维手册

本手册只记录可公开的名称和占位符。不要把 OpenAI 密钥、Supabase secret/service-role key 或清理共享密钥写入仓库、前端变量、工单或聊天。

## 1. 发布前准备

- 本地安装 Node.js 22、npm、Git 与 Supabase CLI；先运行 `node --version`、`npm --version`、`git status --short`、`npx.cmd supabase --version`。
- 使用有权访问目标项目的账号执行 `npx.cmd supabase login`。不要在共享终端记录访问令牌。
- 确认工作区无意外改动，并记录待发布 Git commit。数据库、函数和 Pages 分开发布，任一步失败都停止后续步骤。

发布顺序不得调换：迁移 → `commerce-upload` / `analyze-commerce` / `cleanup-commerce-assets` 函数 → Supabase 服务端 Secrets/环境 → GitHub Variables/Secrets → 可丢弃账号与项目的 staging live gates → Pages。任一步失败时保持“待外部操作门槛”，不继续后续发布。

## 2. 数据库迁移

AI 电商迁移必须按时间戳顺序应用：

1. `202608210001_ai_commerce.sql`
2. `202608290001_admin_entitlement_daily_limit.sql`
3. `202608300001_commerce_cleanup_lease.sql`
4. `202608300002_commerce_cleanup_claim.sql`
5. `202608300003_commerce_cleanup_recovery.sql`
6. `202608310001_commerce_upload_security.sql`
7. `202609030001_commerce_project_validation.sql`

先核对项目引用，再链接和预演：

```powershell
npx.cmd supabase link --project-ref <PROJECT_REF>
npx.cmd supabase migration list --linked
npx.cmd supabase db push --dry-run
```

确认预演仅包含上述待应用文件、已完成备份并选定维护窗口后，才由发布负责人执行 `npx.cmd supabase db push`。先在 disposable 库验证 `202608310001` 的迁移语法和 service_role grant：`reserve_commerce_asset` 仅授权 authenticated，claim/release/finalize/fail/reconcile/list/takeover RPC 仅授权 service_role，public/anon 均无权执行；同时确认 authenticated 的资产表 insert/update/delete 权限和 Storage insert policy 已移除。再验证 `202609030001`：authenticated 对 `commerce_projects` 的直接 INSERT / UPDATE / DELETE 已撤销，只能调用 `create_commerce_project`、`update_commerce_project`、`set_commerce_project_locked` 与既有 fenced delete RPC；`admin_refund_commerce_generation` 虽授予 authenticated 调用入口，函数内仍必须通过 `site_is_admin()`。迁移上线后不承诺破坏性 down migration；回滚采用新的、时间戳更晚的前向修复迁移。

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
npx.cmd supabase functions deploy commerce-upload --no-verify-jwt
npx.cmd supabase functions deploy analyze-commerce --no-verify-jwt
npx.cmd supabase functions deploy cleanup-commerce-assets --no-verify-jwt
```

`commerce-upload` 和 `analyze-commerce` 的 `verify_jwt = false` 只是为了兼容 publishable key，不表示放开访问：两者在函数内取 Bearer token，调用 `auth.getUser()` 并拒绝匿名用户。`cleanup-commerce-assets` 不接受用户 JWT，它的鉴权边界是恒时比较 `x-cleanup-secret` 和服务端 `CLEANUP_SECRET`。只在 Supabase Dashboard 的 Edge Function Secrets 配置以下名称：

- `OPENAI_API_KEY`、`OPENAI_MODEL`
- 可选 `OPENAI_TIMEOUT_MS`：缺失、非数字或非正数时默认 `60 秒`；有限正数 clamp 到 `5 秒..90 秒`（`5000..90000 ms`）。超时映射为 `PROVIDER_TIMEOUT`，走普通 fail RPC 和幂等退款路径。
- `ALLOWED_ORIGINS`
- `CLEANUP_SECRET`
- Supabase 运行时凭据：`SUPABASE_URL`，以及平台提供的 publishable/secret 凭据（当前函数优先识别 `SUPABASE_PUBLISHABLE_KEYS`、`SUPABASE_SECRET_KEYS`，也兼容单数形式与旧版 `SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`）

不要把 secret/service-role 凭据、`OPENAI_API_KEY`、`CLEANUP_SECRET` 或 `OPENAI_TIMEOUT_MS` 放入 GitHub Pages 或任何 `VITE_` 变量。部署后用 `npx.cmd supabase functions list` 与 Dashboard 日志核对版本、启动和静态资源加载错误。

### commerce-upload static_files / WASM 供应链

`supabase/config.toml` 必须保留 `static_files = [ "./functions/commerce-upload/vendor/*" ]`。部署前运行 `Get-FileHash -Algorithm SHA256 supabase/functions/commerce-upload/vendor/*.wasm`，与以下锁定值核对：

| 文件 | 锁定来源 | SHA-256 |
| --- | --- | --- |
| `mozjpeg_dec.wasm` | `@jsquash/jpeg@1.6.0/codec/dec/mozjpeg_dec.wasm` | `a7c4b12169817e779ff4af137981393ae924944e167ad1bd95747c9199162d3e` |
| `squoosh_png_bg.wasm` | `@jsquash/png@3.1.1/codec/pkg/squoosh_png_bg.wasm` | `263d6e658808a74b72a1a99c5cc1d619237e70c150db6e41d5d84d3d117ab9be` |
| `webp_dec.wasm` | `@jsquash/webp@1.5.0/codec/dec/webp_dec.wasm` | `30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344` |

`vendor/README.md` 记录来源/hash，`vendor/LICENSE-APACHE-2.0.txt` 保留 Apache-2.0 许可证，两者与三个 WASM 都必须被 `static_files` 打包。JPEG/PNG 的原生解码只是附加信号，锁定 WASM 复核不可被绕过；WebP 始终使用锁定 WASM。hash、许可证、`static_files` 或任一文件不匹配时立即停止部署。

### 签名上传鉴权边界

浏览器的唯一允许流程是 `reserve` → `signed upload` → `finalize`。reserve 在项目行锁下验证用户/项目、MIME/大小和最多 6 张，并在服务端生成 `<user UUID>/<project UUID>/<random UUID>.<jpg|png|webp>` 路径；只有特权 Storage 客户端为该路径签发一次性 token。finalize 用 service-only CAS 认领 validation attempt，下载对象后检查 Blob MIME、预留/实际大小、8 MiB 上限、JPEG/PNG/WebP 容器和真实解码尺寸，再以 attempt-bound CAS 转为 ready。浏览器不能直接写 `commerce_project_assets` 或任意 Storage 路径。校验失败必须先确认 Storage 对象删除成功，再标记 failed；删除失败时释放 claim 供重试。

项目正文也只能通过 authenticated SECURITY DEFINER RPC 写入。`create_commerce_project` / `update_commerce_project` 对 `category`、`specifications`、`priceRange`、`sellingPoints`、`audience`、`brandTone`、`competitorLinks`、`prohibitedWords`、`desiredStyle`、`notes` 做精确 allowlist：每个值必须是字符串、每字段最多 2000 字符、JSON 总存储不超过 32768 bytes；未知键、数组、对象、数字和超限值全部失败关闭。名称、平台、模式和项目归属同样由数据库验证。

删除项目时，客户端可先读取该用户拥有的 Storage 路径，但必须先调用 `delete_commerce_project` 完成事务栅栏，再删除 Storage 对象。生成先赢时 RPC 会在任何 Storage 删除前拒绝；删除先赢时项目行先消失，再移除对象。后置 Storage 删除失败不伪称数据库回滚：项目删除仍视为成功，现有孤儿对象 cleanup 会继续回收。

## 5. GitHub 配置

Repository Settings → Secrets and variables → Actions：

- Variables（公开构建值）：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`
- Secrets（清理工作流）：`SUPABASE_CLEANUP_URL`、`SUPABASE_CLEANUP_SECRET`

`deploy-pages.yml` 会先拒绝空值和 `.env.example` 占位值，再按 `npm ci` → `npm test` → `npm run build` → 上传 artifact 的顺序执行；deploy job 只依赖成功的 build。`cleanup-commerce-assets.yml` 保留 `workflow_dispatch`，并以 `cron: '*/15 * * * *'` 每 15 分钟运行。workflow 必须保留 `permissions: {}`、5 分钟 timeout、非 2xx 失败和不输出 Secret 的特性。

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

可观察性必须保持安全边界：客户端只接收有限的安全码/文案，例如 `AUTH_REQUIRED`、`VALIDATION_ERROR`、`IMAGE_LIMIT_REACHED`、`ASSET_STATE_CONFLICT`、`PROVIDER_TIMEOUT`、`SERVICE_ERROR`、`UNAUTHORIZED` 和 `CLEANUP_ALREADY_RUNNING`。Edge 日志只记安全的 stage/code 与必要的 asset/generation/run ID，不记 provider 原始异常、Storage/RPC 内部错误、对象字节、Bearer token、signed URL、密钥或 cleanup secret。`cleanup_runs.details.errors` 只保留有界 stage/code/item ID，最多 25 条；`partial` 表示某项失败但后续项仍继续。

## 8. 安全退款与恢复

先查生成记录及相同 `generation_id` 的 `credit_ledger`。模型调用失败的正常路径由 `analyze-commerce` 以 service role 调用 `fail_commerce_generation`；该 RPC 根据 `credit_charged` 与 `refunded_at` 幂等地只退款一次。站长任务表的“人工退款”调用 admin-only `admin_refund_commerce_generation`，必须填写 1–500 字原因；函数锁定 generation 与 entitlement，仅当 `credit_charged=true` 且尚未退款时恰好加 1、设置 `refunded_at`、写唯一 generation-scoped `generation_refund` 流水和 `admin_audit_log`。重复或并发调用返回明确的 `already_refunded` 幂等结果，不会双加。

如生产出现卡住的 processing 任务，优先让正常 stale recovery 调用既有 `fail_commerce_generation`；人工退款只处理计费，不替代任务状态恢复。再次查询生成记录与账本确认只有一条 `generation_refund`。清理恢复继续使用既有 cleanup lease/recovery RPC 链路，不跳过 claim/finalize 状态机。

## 9. 保留与清理策略

- 默认资产保留 `7 天`。当前设置是全站共享的 `storage_soft_limit_bytes = 800000000` 与 `storage_target_bytes = 650000000`，不是每用户配额。
- 全站超过软上限时，从最旧的 ready、未过期、项目未 locked 的候选资产开始清理，直到回到 target；locked 仅阻止这条 soft_limit 提前清理路径。
- 资产超过 7 天后属于 expired；即使项目 locked 仍可清理。不要把 locked 理解为永久保留。
- 与 queued 或 processing 活动生成任务属于同一项目的资产受到数据库栅栏保护。普通“存在项目引用”本身不是永久保护条件。
- 清理函数依次取得 lease、claim 对象、删除 Storage、finalize 数据库记录；异常时释放 claim，并由 recovery 处理过期 lease。不要绕过该顺序直接批量删除桶对象。
- 获取 lease 后先调用 `reconcile_terminal_commerce_assets`，再分页处理放弃上传和孤儿对象，之后才处理 stale generation、expired 和 soft-limit 候选。放弃上传必须经 service-only takeover 在行锁内重查 cutoff，不偷取活跃 CAS claim；Storage 删除成功后才执行 attempt-bound fail。两类恢复均按确定游标分页，页大小 100、每类每运行最多 500 条。

## 10. 回滚

- 前端：保留已验证的 Git commit 与 Pages artifact；回退到 known-good commit 后重新运行完整 CI/Pages 发布，不手改线上静态文件。
- 数据库/函数：发布新的前向修复迁移或已修正的 Edge Function；不删除历史迁移，不承诺恢复已经删除的数据。涉及数据修复时先备份、预演并记录审计原因。
- 安全下限：如 `commerce-upload` 不可用，暂停产品图上传。不得回退到浏览器直写资产表/直传 Storage，不得恢复 authenticated insert/update/delete grant 或 Storage insert policy。回退目标必须仍使用 reserve → signed upload → finalize 安全协议。

## 11. 发布检查表

本地可完成：

- [ ] `.env.example` 只有两个公开占位符，tracked diff 无真实凭据。
- [ ] `npm.cmd test` 全量通过，`npm.cmd run build` 通过。
- [ ] 深浅主题、390px/桌面布局、reduced motion、键盘路径与控制台错误完成本地浏览器审计。
- [ ] workflow 引用 GitHub Variables/Secrets 名称，未把服务端密钥注入前端。

生产专属门槛（本地 mock/unit 只能证明契约，不能替代）：

- [ ] **迁移语法/grants**：七个 AI 电商迁移在新建 disposable PostgreSQL/Supabase 项目完整执行；核对 service_role grant、authenticated 仅能 reserve、public/anon 不可执行 service-only RPC，且普通用户直接写资产行失败。
- [ ] **项目输入 RPC/直写拒绝**：普通 authenticated 令牌直接 INSERT/UPDATE `commerce_projects` 失败；create/update RPC 接受 allowlist 内正常字符串，并拒绝超过 2000 字符、nested JSON、未知键、非字符串、总字节超限、非法 name/platform/mode 和跨用户项目。
- [ ] **人工退款重复/并发**：对同一已扣次 generation 并发调用管理员退款并与自动 fail/refund 交错，最终额度只增加 1、`refunded_at` 非空、仅一条 `generation_refund`、仅一次成功审计；后续请求返回 `already_refunded`。
- [ ] **直传孤儿对象拒绝**：不经 reserve 直接向自己前缀或伪造路径上传时 Storage 拒绝，不产生资产行/孤儿对象。
- [ ] **第七张**：同项目已有 6 个非删除状态时，串行和并发的第七张都在项目行锁下返回 `IMAGE_LIMIT_REACHED`，不生成 token/对象。
- [ ] **跨用户 RLS/路径**：用户 B 不能 reserve/finalize 用户 A 的项目或 asset，不能读取/删除 A 的行，也不能使用或构造 A 的 path/token。
- [ ] **伪造 MIME/大小与 Blob MIME**：声明 MIME、字节容器、实际大小、预留大小和 Storage 返回 Blob MIME 任一不一致时，对象先被删除，行再转 failed，不得 ready。
- [ ] **真实解码/static_files**：在部署后的原生 Deno 中确认三个 WASM 按 hash 加载；真实 1×1 JPEG/PNG/WebP 解码成功，截断、空帧、像素炸弹和多聚文本失败并清理。
- [ ] **finalize CAS**：同一 asset 并发 finalize 时只有一个 attempt 获得 claim，其他请求不下载/删除对象；同 attempt 重试幂等。
- [ ] **takeover/中断 finalize**：模拟进程中断留下 validating 行；cutoff 之前或活跃 claim 不能被 takeover，超时后 cleanup 在行锁内重查、用新 attempt 接管，对象删除成功后才 failed。
- [ ] **响应丢失 finalize**：让 signed upload 已在 Storage 成功但浏览器丢失响应，确认使用同一 reservation 调用 finalize，不新建 reserve，最终只有一个 ready asset。
- [ ] **原子终态恢复**：complete/failed 终态写入与最后一个活跃任务结束后的 processing → ready 在同一事务；仍有另一个 queued/processing 任务时不提前恢复，历史遗留行由 reconciliation 收敛。
- [ ] **提供商超时/超时退款**：用可控慢/无响应 provider 验证默认 60 秒 AbortSignal 和 `OPENAI_TIMEOUT_MS` 5..90 秒 clamp；返回 `PROVIDER_TIMEOUT`，只写一条 `generation_refund`，资产不留在 processing。
- [ ] **cleanup 分页/孤儿清理**：各造超过 100 个放弃上传和孤儿对象，验证游标无重复/无遗漏、每类最多 500，单个删除失败不阻断后续项；孤儿对象被删除，放弃行仅在对象删除后 failed。
- [ ] **定时/安全错误**：`*/15 * * * *` 与手动 workflow 均能触发；缺失/错误 `x-cleanup-secret` 返回 401，非 2xx 使 workflow 失败，日志和响应不暴露 Secret/provider/Storage 内部值。
- [ ] 匿名调用 `analyze-commerce` / `commerce-upload` 返回 401；相同幂等键并发/重试只扣费一次，模型失败只退款一次，账本余额闭合。
- [ ] cleanup lease/recovery、GitHub/Google OAuth 登录回跳，以及生产 Pages 冒烟（自定义域名、HTTPS、路由、Supabase、CORS、移动端）全部正常。

未逐项通过上述生产门槛时，发布状态保持“待外部操作门槛”。
