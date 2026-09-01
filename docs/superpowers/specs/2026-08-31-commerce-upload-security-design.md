# AI 电商上传与后台恢复安全加固设计

日期：2026-08-31
状态：按用户既有“后续采用最优推荐方案并持续执行”的授权确认
范围：修复最终整分支审查发现的 1 个 Critical 与 2 个 Important，不扩展产品功能或视觉范围。

## 1. 问题与目标

当前浏览器可直接创建、更新 `commerce_project_assets` 行，并可凭用户目录 Storage 策略任意上传对象。恶意或被篡改的客户端能够绕过每项目最多 6 张图片、资产生命周期和真实文件校验；没有数据库资产行的对象也不会进入软上限统计与定时清理。

后台还有两个恢复缺口：生成任务先写终态，再以 best-effort RPC 恢复图片，进程中断时会留下永久 `processing` 资产；OpenAI 请求没有应用级 deadline，运行时强制终止时不能及时失败、退款和恢复。

本轮目标：

1. 普通登录用户不能直接创建/推进资产行，也不能直接创建任意 Storage 对象。
2. 每次上传由服务端绑定真实用户、项目、服务端生成路径和 6 图上限。
3. 上传完成后由可信服务验证真实字节数、允许 MIME 和 JPEG/PNG/WebP magic bytes，再原子置为 `ready`。
4. 失败上传可幂等清理，历史孤儿对象可被清理任务发现。
5. 生成成功/失败与资产恢复在同一数据库事务内；cleanup 还能修复历史遗留的终态 `processing` 资产。
6. AI 请求在 60 秒内明确超时，走既有安全失败、幂等退款与资产恢复链路。

## 2. 方案选择

### A. 服务端预留 + 一次性签名直传 + 服务端 finalize（采用）

优点：文件不经业务函数转发，适合最多 6 张、单张 8 MiB；浏览器拿不到 service-role；服务端能够生成唯一对象路径并验证真实内容。缺点：上传分为 reserve/upload/finalize 三步，需要处理半完成状态。

### B. 仅强化 RLS

可以要求对象路径匹配 `uploading` 资产行，但浏览器仍能伪造 size/MIME 或滥用允许的状态转换，无法满足服务端文件头验证，因此不采用。

### C. 图片完整经过 Edge Function

安全边界集中，但会放大函数请求体、内存、执行时间和重试成本，多图上传更容易触及平台限制，因此不采用。

## 3. 架构与职责

新增 `commerce-upload` Edge Function，内部校验 Bearer 会话且拒绝匿名身份，使用用户客户端处理身份语义、service-role 客户端处理签名和可信 finalize。函数支持两个 action：

- `reserve`：接收 `projectId`、客户端文件名、声明 MIME 和声明字节数。数据库 RPC 在项目行锁下验证项目归属、非匿名身份、允许类型/大小和当前有效资产数量小于系统 `max_project_images`；对象路径由服务端生成。随后 service-role Storage 创建一次性签名上传凭证，返回 asset ID、path、token。
- `finalize`：接收 asset ID。函数确认资产属于当前用户且仍为 `uploading`，使用 service-role 下载对象，检查实际字节数与预留值、8 MiB 上限、声明 MIME 与 magic bytes 一致；通过后调用 service-only RPC 原子标记 `ready`。失败则删除对象并通过 service-only RPC 标记 `failed`，只返回安全错误。

前端 Repository 仍按文件逐个上报进度，但不再写资产表或调用普通 `storage.upload`；它调用 reserve、`uploadToSignedUrl`、finalize。重试继续复用现有项目级清理策略，禁止直接状态修改。

## 4. 数据库与 Storage 边界

新增前向迁移，不依赖重写已经部署的历史：

- 撤销 authenticated 对 `commerce_project_assets` 的 insert/update/delete grants，并删除对应写策略；保留 own-select。
- 删除 authenticated 的 `commerce_storage_insert_own`，使普通访问令牌不能直接创建对象；保留 own-select/delete 供既有查看和项目删除链路使用。一次性 signed-upload token 由 service-role 生成。
- 新增 `reserve_commerce_asset`、`finalize_commerce_asset_upload`、`fail_commerce_asset_upload`，分别限制 authenticated 或 service_role，并使用空 `search_path`、明确 revoke/grant、项目/用户行锁和固定状态转换。
- 新增只授予 service_role 的孤儿对象查询 RPC，以 `storage.objects.name` 稳定游标分页返回 bucket 中不存在对应资产行的对象；cleanup 用 Storage API 删除，不直接修改 `storage` schema。
- 重新定义 complete/fail generation RPC：在写终态和退款的同一事务里，把项目中没有其他 active generation 的 `processing` 资产恢复为 `ready`。
- 新增 service-only reconciliation RPC：恢复没有 queued/processing generation 的历史 `processing` 资产，供 cleanup 每次候选选择前调用。

并发规则：项目预留、生成开始、项目删除和 cleanup claim 必须共享项目行锁；第七张图片在数据库层拒绝。资产路径不可由客户端指定，且必须保持 `<user>/<project>/<server-uuid>.<ext>`。

## 5. 失败与恢复

- reserve 后未上传：资产保持 `uploading`，cleanup 将超过短暂保留窗口的上传预留标记失败并删除已存在对象。
- 上传成功但 finalize 网络失败：前端可对同一 asset ID 幂等重试 finalize，不再预留第七行。
- magic/MIME/大小不符：删除对象、标记 `failed`，不允许进入分析。
- worker 在生成终态 RPC 内中断：数据库事务整体提交或整体回滚，不出现“任务终态但资产仍 processing”的新状态。
- 历史异常状态：cleanup reconciliation 先修复，再计算过期和软上限候选。
- OpenAI 超时：默认 60 秒 AbortController；超时映射 `PROVIDER_TIMEOUT`，走 fail RPC 幂等退款。每日清理改为每 15 分钟执行，作为硬崩溃的兜底，而不是正常超时机制。

## 6. 测试与发布门槛

本地契约测试必须覆盖：

- 前端只走 reserve/signed upload/finalize，不再直接写资产表或普通上传。
- 迁移撤销直接写权限、删除 Storage insert policy、6 图数据库限制、固定路径、service-only finalize/fail/reconcile/orphan RPC 权限。
- PNG/JPEG/WebP magic bytes、类型/大小不匹配、缺失对象、重复 finalize 与失败清理。
- complete/fail 在同一 RPC 中恢复资产，历史 terminal orphan reconciliation。
- OpenAI 60 秒 deadline、abort 错误码与 timer 清理。
- cleanup orphan 分页、终态资产修复和 15 分钟 workflow。
- 全量 Vitest、TypeScript build、diff/credential scan。

生产门槛仍需 disposable/staging Supabase：普通用户直接 orphan upload 被拒、第七图被拒、伪造 MIME/size 被拒、跨用户被拒；真实 Deno 打包、signed upload、Storage 下载/finalize、事务恢复、OpenAI 超时退款和 cleanup orphan/recovery 均实测。未通过前不推送生产迁移或函数。

## 7. 非目标

- 本轮不实现历史项目/生成分页 UI；继续作为非阻塞 Minor 记录。
- 不改变首页、工作台视觉、额度产品规则、7 天绝对到期或全站 800000000→650000000 软上限语义。
- 不在仓库、前端变量、日志或聊天中写入任何服务端密钥。
