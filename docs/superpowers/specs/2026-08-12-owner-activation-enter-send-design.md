# 站长身份激活与 Enter 发送设计

## 目标

- 让文昊通过 GitHub 或 Google 登录后获得留言板站长权限。
- 留言输入框支持 `Enter` 发送、`Shift + Enter` 换行。
- 不降低现有 Supabase RLS 与管理员权限安全性。

## 站长身份

- 继续以 `public.guestbook_admins.user_id` 白名单作为唯一站长判定来源，不使用昵称或可变邮箱判断权限。
- 在 Supabase Dashboard 的 Authentication → Users 中复制文昊登录账号的 User UID，再插入 `guestbook_admins`。
- 如果 GitHub 与 Google 被 Supabase 合并为同一用户，只需添加一个 UID；如果形成两个用户，则将两个确认属于文昊的 UID 都加入白名单。
- 前端登录完成后继续调用 `guestbook_is_admin()`；命中白名单时显示“站长身份/站长在线”，并开放审核与管理操作。

## 输入交互

- `Enter`：触发表单现有发送逻辑。
- `Shift + Enter`：保留原生换行行为。
- 输入法正在合成文字时不发送，避免中文选词按 Enter 误提交。
- 发送进行中不重复提交；空内容、未填写昵称和图片消息继续沿用现有校验。
- 点击“发送”按钮的行为保持不变。

## 验证

- TypeScript 与 Vite 生产构建通过。
- Playwright 验证 Enter 发送、Shift+Enter 换行、空消息拦截和中文输入法保护条件。
- 线上发布后检查留言页控制台无新增错误。
- 站长权限在 UID 写入后由文昊本人刷新并验证；前端不接触 service role 密钥。

