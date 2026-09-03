# OAuth 已有账号恢复设计

## 背景与目标

站点为未登录访客建立 Supabase 匿名会话，并在访客选择 GitHub 或 Google 登录时优先调用 `linkIdentity()`，以便正式账号继承匿名留言等数据。当 OAuth 邮箱已经属于另一个 Supabase 用户时，Supabase 会以 `email_exists` 或 `identity_already_exists` 结束绑定流程。当前实现只识别后者，因此 GitHub 配置修复后，已有账号仍停留在匿名状态并看到 “A user with this email address has already been registered”。

目标是在不破坏首次用户匿名身份升级的前提下，让已有 GitHub/Google 账号自动切换为普通 OAuth 登录，并避免重定向循环。

## 方案选择

采用“绑定优先、冲突时一次性切换登录”：

- 匿名用户仍先调用 `linkIdentity()`，保留新账号继承匿名数据的能力。
- 当回调错误码为 `email_exists` 或 `identity_already_exists`，且当前 OAuth 意图为 `link` 时，改用同一 provider 发起一次 `signInWithOAuth()`。
- 普通登录意图收到相同错误时不再重试，而是显示错误，防止循环。
- 其他错误不触发降级或重试，继续按现有错误处理路径返回匿名会话和可见提示。

未采用“所有匿名用户直接普通登录”，因为这会丢失匿名用户与留言数据的自然继承路径。也不增加数据库层账号合并，因为本次问题可由 Supabase 官方身份流程解决，账号迁移会扩大风险与范围。

## 数据流

1. 访客点击 GitHub 或 Google 登录。
2. 当前会话为匿名时，写入 `{ provider, mode: 'link' }` 和返回 hash，调用 `linkIdentity()`。
3. 若绑定成功，按现有 PKCE 回调交换会话并清理临时状态。
4. 若回调为已存在账号冲突：
   - 保留返回 hash；
   - 将意图改写为 `{ provider, mode: 'sign-in' }`；
   - 调用 `signInWithOAuth()`；
   - 第二次回调成功后得到正式会话并回到原页面。
5. 若 `mode` 已是 `sign-in`，不再自动重试。

## 代码边界

- `src/auth/AuthProvider.tsx`
  - 增加一个集中判断“可从绑定切换到登录”的小函数，避免错误码条件分散。
  - 复用现有 `beginOAuth()`、OAuth intent 和 return hash，不引入新存储键或新依赖。
  - 为 `email_exists` 补充用户可读中文提示，供无法自动恢复的边界情况使用。
- `tests/auth-provider.test.tsx`
  - 增加 `email_exists + link` 自动切换普通登录的回归测试。
  - 覆盖返回 hash 保留、provider 保持一致、意图变为 `sign-in`。
  - 增加 `email_exists + sign-in` 不重试测试，证明不存在循环。
  - 保留现有 `identity_already_exists`、StrictMode 和正常 PKCE 用例。

## 错误处理与安全

- 只有 Supabase 明确的已有账号冲突码触发自动恢复；网络失败、授权拒绝、PKCE 失败及未知错误均不自动重试。
- 自动恢复只允许从 `link` 转到 `sign-in`，状态机不会从 `sign-in` 再次启动 OAuth。
- OAuth 临时意图和返回地址仍只保存在 `sessionStorage`，不持久化令牌或 provider secret。
- GitHub Client Secret 仅保存在 Supabase provider 配置中，不进入源码、构建产物或日志。

## 验证标准

- 单元测试验证两个已有账号冲突码都可从绑定切换到普通登录。
- 单元测试验证普通登录态遇到冲突不会二次跳转。
- 全量 Vitest、TypeScript/构建检查通过。
- 部署后在 `https://geniusli.cn/#ai-commerce` 使用 GitHub 完成真实 OAuth：工作台不再显示 `LOGIN REQUIRED`，账号菜单显示正式账号；若该用户位于 `guestbook_admins`，站长身份同时生效。
- 浏览器控制台无站点脚本错误，未知 OAuth 错误仍可见且不会循环跳转。
