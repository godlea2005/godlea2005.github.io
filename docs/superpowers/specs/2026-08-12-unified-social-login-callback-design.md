# GitHub 与 Google 统一登录回调设计

## 目标

修复社交登录返回网站后仍保持匿名的问题，并让 GitHub、Google 共用一条可观察、可恢复的 OAuth PKCE 流程。匿名访客首次连接账号时保留当前用户 ID 和留言所有权；已经绑定过的第三方账号在新浏览器中自动切换为登录已有账号。

## 回调流程

- Supabase 客户端关闭自动 URL 会话检测，由留言认证模块显式处理 `code`、`sb_flow_id` 与 OAuth 错误参数。
- 收到授权码后先调用 `exchangeCodeForSession`，确认新会话已保存，再把 URL 规范化为 `/#guestbook`。
- 发起登录前在 `sessionStorage` 记录 Provider 和动作类型，回调时据此恢复流程。
- 匿名访客默认调用 `linkIdentity`。若 Provider 返回 `identity_already_exists`，自动改用 `signInWithOAuth` 登录已有账号，不把错误静默吞掉。
- 用户取消、Provider 未启用、PKCE 过期或身份冲突均显示明确中文提示。

## Provider 与界面

- 从 Supabase 公开 `/auth/v1/settings` 读取 GitHub/Google 实际启用状态，不依赖前端硬编码。
- GitHub 与 Google 按钮使用同一连接方法；未生效的 Provider 显示禁用状态及“配置未生效”。
- 回调处理中显示登录状态，成功后显示“已连接账号”和实际 Provider。
- Google 只请求 `openid email profile` 基础身份范围，不访问 Gmail、Drive 等额外数据。

## 验收

- GitHub 已授权时即使不再出现授权确认页，也能回站并升级/登录为永久账号。
- 已绑定 GitHub 的用户在新浏览器点击登录时自动进入已有账号。
- Supabase Google Provider 返回启用后，Google 按钮可点击并进入 Google 账号选择页。
- 回调完成前不删除 `code`；完成后 URL 为 `/#guestbook`。
- 匿名留言、RLS、站长权限、移动端布局和生产构建保持正常。
