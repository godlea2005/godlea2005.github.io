# GitHub OAuth 回调路由修复设计

## 问题

留言页使用 `#guestbook` 作为前端路由，但 GitHub OAuth 经 Supabase 返回时使用 `/?auth=guestbook`。应用只根据 hash 判断当前页面，因此回调先渲染首页，留言页及其 Supabase Auth Provider 没有挂载，用户看不到已连接身份。

## 已批准方案

- 应用启动时同时识别 `location.hash` 与 `auth=guestbook` 查询参数。
- 只要 `auth=guestbook` 存在，即先挂载留言页，让 Supabase 完成 PKCE 回调与会话恢复。
- Auth 状态准备完成后，用 `history.replaceState` 将地址规范化为 `/#guestbook`，移除 OAuth 临时参数，不产生额外历史记录。
- 保持现有匿名身份升级逻辑，避免匿名留言的所有权因登录而丢失。
- 不修改 GitHub Provider、Google 登录或微信登录配置。

## 验收

- 直接访问 `/?auth=guestbook` 显示留言页而不是首页。
- GitHub 登录请求仍使用 Supabase Callback，并携带 `redirect_to=https://geniusli.cn/?auth=guestbook`。
- 回调完成后地址为 `https://geniusli.cn/#guestbook`，资料面板显示已连接账号。
- 普通首页、音乐页、匿名留言和生产构建保持正常。
