# 项目过程日志

## 2026-08-09 — 首版基线

- 目标：为文昊搭建 React + Vite 个人网站，优先展示作品，并为后续内容系统和服务端扩展留出接口。
- 视觉：以暗色、高级、克制和科技感为基调，参考目标站的信息层级、状态感与探索逻辑，不复制其品牌资产或代码。
- 版式：桌面端使用精确最大版心，移动端使用固定安全页边距；深色与浅色均作为完整模式实现。
- 数据：演示内容集中在静态适配层，未来可替换为 API 或 CMS 数据。

## 2026-08-10 — 首页实现与数字工作室重构

- 完成 React + Vite 单页基础、主题持久化、移动菜单、作品区和个人状态场景。
- 根据反馈将传统作品集首页重构为“文昊的数字工作室”，强化个人状态、数字地图、案例和实验记录。
- 移除外部字体依赖，补充站点图标，避免第三方资源失败影响首屏。
- `npm run build` 通过。

## 2026-08-11 — 沉浸式音乐页

- 参考页面逻辑复盘：音乐页应是全屏沉浸场景，由中央可视化、漂浮歌词、底部控制台和侧边歌单组成，不是普通播放器卡片。
- 建立独立 `#music` 路由，实现曲目切换、播放状态、进度、音量、循环模式、歌词显隐、歌单抽屉和响应式布局。
- 保持差异化视觉；不复制参考站素材、品牌、文案或代码。

## 2026-08-11 — 接入本地音频

- 将用户提供的《红色高跟鞋》和《说了再见》MP3 复制到 `public/music/`，并接入原生 HTML Audio 播放链路。
- 播放器已使用真实音频事件驱动播放/暂停、时间轴、时长、切歌、音量、结束续播和循环状态。
- 接通 LRC 文件加载、时间轴解析、当前行高亮与自动滚动；随后用用户提供的完整 LRC 替换占位文件，歌词由真实播放时间驱动。
- Playwright 验证：《红色高跟鞋》识别时长 3:26，进度可持续前进；切换《说了再见》后识别时长 4:17，播放状态连续。
- 移动端验证：390 × 844 视口下标题、中央视觉、歌词状态和底部控制台均在安全区域内，无横向溢出。
- 维护原则：新增歌曲时使用稳定的站内文件名和独立元数据，避免把桌面源路径写入前端代码。

## 2026-08-11 — GitHub Pages 发布准备

- 目标仓库：`godlea2005/godlea2005.github.io`；保留原有自定义域名 `geniusli.cn`，替换旧页面和旧 assets。
- 发布方式：现有账号令牌缺少修改 Actions 工作流所需的 `workflow` 权限，因此沿用仓库原有的 `main` 根目录静态发布方式，上传已经验证的 `dist` 产物。
- 源码继续保存在本地项目工作区；后续获得 `workflow` 权限后，可升级为提交源码并自动构建发布。

## 2026-08-11 — 播放控件光学居中

- 原因：Unicode 播放字符的字形留白和文字基线不对称，按钮盒模型居中时仍会产生视觉偏移。
- 修复：使用 CSS 三角形和双竖条替换字体图标，主按钮改为网格居中，并对播放三角形增加 2px 光学校正。
- 验证：390 × 844 视口下播放与暂停状态均居中；点击播放后时间轴从 0:00 正常前进，读屏名称同步切换。

## 2026-08-11 — 参考站音乐体验重构（A 方案）

- 重新审视参考站桌面与移动端真实交互，明确视觉骨架为“唱片封套与黑胶 + 右侧同步歌词 + 全屏青色音频地形 + 左侧覆盖式歌单”，废弃此前偏离目标的中央圆球方案。
- 新增全局 `MusicProvider`，整站只保留一个 HTML Audio 与一套播放状态；从首页进入音乐页或返回首页时，曲目、进度、音量和循环模式保持连续。
- 使用 Three.js `InstancedMesh` 实现音频响应方块地形，连接 Web Audio `AnalyserNode`；桌面约 4,800 个实例、移动端约 2,300 个实例，并限制 DPR、暂停不可见页面渲染、提供无 WebGL 降级视觉。
- 桌面端建立唱片舞台、竖排曲目信息、歌词窗口与底部控制台；移动端改为满屏地形、居中歌词和严格贴近参考逻辑的双行控制台。
- 歌单采用磨砂覆盖层，桌面从左侧滑入、移动端整屏上推；首页新增精简音乐 Dock，共用同一播放器状态。
- 音乐页代码按路由懒加载，首页生产 JS 保持约 212 KB；`npm run build` 已通过。两个 LRC 文件分别识别 28 与 35 条有效时间轴。
- Playwright 首轮页面结构检查为 0 个运行时错误；后续截图权限通道临时中断，桌面播放态与 390 × 844 移动端最终视觉回归仍列为发布前必做项。

## 2026-08-11 — 音乐页比例与版心修复

- 根据用户实机截图定位到桌面元素各自依赖视口宽度放大，导致封套过大、黑胶侵入歌词、竖排歌名跨列和控制台贴边。
- 音乐主体统一到最大 `1280px` 版心；标准桌面封套限制为 `240–280px`，黑胶限制为 `270–310px`，两者按固定露出比例组成单一视觉单元。
- 竖排歌名进入唱片组合内部的独立窄轨道，字号降至 `20–24px`；在 `901–1179px` 中等桌面尺寸自动切换为水平信息条。
- 歌词列获得独立裁切边界，当前歌词在音乐前奏阶段也能正确高亮第一行；非当前歌词适当提亮，避免背景地形上无法阅读。
- 桌面控制台改为与音乐版心和封套左边缘对齐；新增宽桌面、中桌面、低高度桌面三组断点，避免比例只适用于单一截图尺寸。
- 第二轮截图复核后，歌词取消单行省略并允许完整换行；封套改为显示完整歌名，五字歌名使用独立字号上限。
- 黑胶进一步向封套内收拢，露出比例贴近参考站；桌面控制台改为紧跟唱片组合下方，不再锚定视口底部。
- 竖排歌名拆成两条独立绝对定位轴，歌名和艺术家信息各自保持单列，避免浏览器将四字歌名自动折到第二列。
- 黑胶改用独立定位容器：容器中心固定在封套右边缘，唱片旋转不再影响组合定位，标签中心点与封套边线精确相交。
- 唱片标签增加 SVG 弧形微字 `WENHAO · PRIVATE AUDIO · 2026`，文字随黑胶同步旋转，保持低亮灰白以避免装饰过重。
- 桌面歌词窗口由七行扩展为九行，普通歌词和当前歌词分别提高字号与亮度；低高度桌面保留独立的紧凑字号覆盖。

## 2026-08-11 — 留言页开放频道（A 方案）

- 复盘参考站留言页的真实浏览器结构与交互，将页面定位为“开放频道式聊天室”，而不是传统博客评论卡片；保留日期分段、左右消息气泡、公告、规则和固定输入区的核心逻辑。
- 新增独立 `#guestbook` 页面和按路由懒加载，联系导航中的“留言”入口已接通；留言页沿用全站精确版心、深浅主题和移动端安全边距。
- 建立 `GuestbookRepository` 数据接口与版本化 LocalStorage 实现，消息、游客资料和本次会话草稿均可在本地持久化；后续只需替换 Repository，即可连接服务器、审核接口和数据库。
- 完成游客身份、300 字输入、表情、图片、回复引用、复制、刷新、公告关闭、规则弹窗和日期时间线；图片在本地预览阶段限制为 600KB，避免 LocalStorage 膨胀。
- 留言页保留全局音乐状态，但将播放器收为右上角紧凑入口，避免遮挡消息阅读与底部输入区。
- Playwright 已验证桌面端与 390 × 844 移动端、深浅主题、游客资料、发送、刷新后保留、回复引用和表情面板；浏览器控制台无运行时错误，仅有 React 开发模式提示。
- 根据视觉反馈移除页面顶部独立的大号“留言”标题，仅保留 `04 OPEN CHANNEL` 状态标识；同步收紧桌面和移动端顶部占位，并重新完成两端截图回归。

## 2026-08-12 — Supabase 留言数据库与 GitHub 登录

- 留言页由 LocalStorage 预览升级为 Supabase PostgreSQL、匿名 Auth、RLS 与 Storage 架构；访客无需登录即可留言，并只能修改当前身份拥有的数据。
- 完成共享留言列表、新增、编辑、删除、站长审核、游客资料同步和本地降级；数据库函数负责公开字段裁剪与站长身份判断。
- 已通过两个隔离浏览器验证共享读取与越权保护，测试数据随后清理；生产构建通过。
- GitHub OAuth Provider 已启用，真实浏览器可正确进入 GitHub 授权页，并携带 Supabase Callback 与留言页返回地址。
- 首轮仅开放 GitHub 登录；Google 登录已于后续统一回调改造中接入。
- 增加 GitHub Pages 自动部署工作流，生产构建使用公开的 Supabase Project URL 与 Publishable Key；`.env.local` 继续保持 Git 忽略。

## 2026-08-12 — GitHub OAuth 回调路由修复

- 修复 OAuth 返回 `/?auth=guestbook` 时应用先渲染首页、导致留言页认证模块未挂载的问题。
- 应用启动和浏览器历史变化时统一解析查询参数与 hash；检测到留言认证回调会立即挂载留言页。
- Supabase 恢复会话后继续将地址规范化为 `/#guestbook`，不增加浏览历史，也不影响匿名留言所有权升级。

## 2026-08-12 — GitHub / Google 统一登录回调

- 将 OAuth PKCE 回调改为显式交换授权码，只有在会话建立后才清理 URL，避免回站后仍显示匿名。
- 匿名访客优先绑定当前身份；第三方身份已经存在时自动切换为登录已有账号，并显示真实错误状态。
- 登录入口读取 Supabase 公开 Provider 状态：GitHub 与 Google 共用一套流程，未保存配置的 Provider 会显示禁用状态。
- Supabase 公开设置已核验 GitHub、Google 均为启用；Playwright 分别验证进入 GitHub 官方登录页和 Google 账号登录页。
- 匿名会话不再调用站长身份 RPC，消除正常访客访问时的控制台 401；失败回调会恢复匿名会话并返回留言页，不再静默落回首页。

## 2026-08-12 — 站长身份说明与键盘发送

- 站长权限继续使用 `guestbook_admins.user_id` 白名单，不按昵称或可修改邮箱判断；OAuth 登录账号需在 Supabase 中加入管理员表后才显示站长身份。
- 留言输入框支持 `Enter` 发送、`Shift + Enter` 换行；中文输入法合成与候选词确认阶段不会误触发送。
- 发送中的表单会忽略重复提交，鼠标点击发送按钮的原有行为保持不变。

## 2026-08-13 — 悬浮导航与折叠音乐坞

- 根据参考站真实交互重构全站导航：桌面端为品牌、主导航、搜索/主题三段式玻璃胶囊，主页具备选中态，下拉菜单支持互斥展开、外部点击和 Escape 关闭。
- 手机端改为品牌与目录双胶囊，目录打开左右内缩的全宽玻璃面板，文章、联系我、我的分组可在面板内继续展开。
- 全局音乐播放器不再常驻横向占位，默认只显示右下角独立音符按钮；播放时按钮切换为轻量均衡器状态。
- 点击音乐按钮后，桌面端展开右下角浮层，手机端展开底部面板；保留歌曲信息、进度、播放/切歌、音量、歌单和音乐可视化入口。
- 展开与收起只改变界面状态，不影响 `MusicProvider` 中的播放；Playwright 已验证收起后进度继续前进，并验证桌面/390px 手机端导航、菜单和播放器状态。
- 生产构建通过；浏览器控制台无应用错误，仅保留 React 开发模式提示。

## 2026-08-30 — AI 电商设计工作台（待外部操作门槛）

- 产品范围：新增面向俄罗斯跨境市场及抖音、淘宝等国内平台的 AI 电商设计工作台，覆盖产品资料、图片、平台预设、策略分析、提示词与可追踪生成记录；首页已将 AI 电商能力作为主入口，个人身份作为作者与交付能力证据。
- 数据库迁移：`202608210001_ai_commerce.sql`、`202608290001_admin_entitlement_daily_limit.sql`、`202608300001_commerce_cleanup_lease.sql`、`202608300002_commerce_cleanup_claim.sql`、`202608300003_commerce_cleanup_recovery.sql`；函数目录为 `analyze-commerce` 与 `cleanup-commerce-assets`。
- 认证与权限：沿用 Supabase OAuth/会话；匿名分析必须拒绝。生成采用幂等扣次与失败退款，站长经 `site_admins` 和管理员 RPC 管理默认额度、每日额度、999 次、不限次数、禁用状态与审计原因。
- 资产策略：私有 `commerce-assets` 桶默认保留 7 天；当前为全站共享 800000000 bytes 软上限、650000000 bytes 回收目标。soft-limit 路径只选择最旧、ready、未过期、未 locked 资产；超过 7 天的 expired 资产即使 locked 仍可清理；queued/processing 活动任务提供项目级保护。
- 本地验证：Task 11 静态部署契约 3/3、全量 11 个测试文件共 186/186 通过，生产构建通过（保留既有 MusicPage 大于 500 kB 警告）。父任务已用 Playwright 复核 1440px 与 390px、深浅主题、CTA 跳转 `#ai-commerce`、登录门槛/弹层、移动目录与 Escape、无横向溢出、音乐坞不遮挡；浏览器 console error/warning 为 0/0。登录后的真实生成、数据库与 Storage 流程仍待部署环境验证。
- 发布状态：`待外部操作门槛`。尚未在本任务执行远程迁移、函数部署、GitHub Pages 发布或生产数据写入。
- 已知限制：Deno Edge runtime、真实 PostgreSQL/RLS、真实 GitHub/Google OAuth、OpenAI 调用、私有 Storage 签名访问和 cleanup 安全边界仍须在受控部署环境完成生产门槛验证。

## 2026-09-02 — AI 电商安全上传发布门槛

- 安全边界收口：新增 `202608310001_commerce_upload_security.sql` 和 `commerce-upload`，浏览器仅走 reserve → signed upload → finalize；普通已认证用户不再能直写资产表或直传 Storage。上传校验包含 service-only CAS/takeover、Blob MIME/大小/容器检查和锁定 WASM 真实解码。
- 后台恢复收口：OpenAI 请求默认 60 秒超时，`OPENAI_TIMEOUT_MS` 限定在 5..90 秒，超时继续走幂等失败/退款；cleanup 改为 `*/15 * * * *`，在普通候选前处理终态资产恢复、放弃上传和孤儿对象的确定分页。
- 运维文档收口：明确了六个迁移的顺序、三个 Edge Function 的部署顺序、WASM `static_files`/来源/许可证/SHA-256、Supabase 与 GitHub 变量边界、安全错误/可观察性、disposable staging live gates 和禁止回退到直写的策略。
- RED→GREEN 记录：部署契约首先因运维手册缺少新迁移/函数而失败（1 failed / 3 passed）；文档与契约更新后 focused 4/4 通过，全量 13 个测试文件共 228/228 通过，生产构建通过。构建仍仅有既有 `MusicPage` 527.28 kB 大于 500 kB 的 chunk 警告，本次未修改该模块。
- 发布状态继续为“待外部操作门槛”：本任务没有 link 远程项目、应用迁移、部署函数、读写 Secrets、触发 workflow 或发布 Pages。原生 Deno 启动/bundle、真实 PostgreSQL 语法/grants/CAS/takeover、Storage signed upload/Blob MIME/删除、第七张、跨用户、响应丢失 finalize、超时退款、cleanup 分页/孤儿清理仍须在 disposable/staging 完成。

## 2026-09-03 — 最终分支审查集中修复

- 新增 append-only `202609030001_commerce_project_validation.sql`：撤销 authenticated 对 `commerce_projects` 的直接写入，create/update/locked 统一走 owner-checked SECURITY DEFINER RPC；十个专业字段采用精确 allowlist、字符串类型、单字段 2000 字符和 32768-byte 总上限。
- 项目删除改为先执行 `delete_commerce_project` 权威栅栏，再删除已查询的 owned Storage 路径。生成先赢时不触碰对象；删除先赢后即使 Storage 失败，数据库结果仍保持成功并由既有 orphan cleanup 收敛。
- 新增 admin-only `admin_refund_commerce_generation` 与站长任务表人工退款动作：generation/entitlement 行锁、`refunded_at`、唯一 `generation_refund` 流水和审计原因共同保证重复/并发只加 1 次。
- 浏览器现在在 reserve 前拒绝零字节图片。发布状态仍为“待外部操作门槛”；未执行远程迁移、函数部署、Secrets、workflow 或 Pages 操作。

## 2026-09-03 — Edge 本地原生验证补齐

- 仓库固定 `deno@2.9.6`、`supabase@2.116.0` 与匹配 Node 24 的 `@types/node@24.13.3`，新增 `npm.cmd run check:edge`，避免只依赖 Vitest 的 Node fallback。
- 原生 Deno 首轮检查发现并修复 Error 子类 `override`、WASM/Blob 的 owned `ArrayBuffer` 类型兼容，以及测试辅助类型声明；三个 Edge Function 入口 `deno check` 通过，原生 Deno 测试 65/65 通过。
- Supabase CLI 本地版本检查通过；CLI 缓存目录 `supabase/.temp/` 已加入忽略规则。尚未登录或 link 远程 Supabase，也未应用迁移、部署函数、读写 Secrets、触发 workflow、推送 GitHub 或发布 Pages。
- 发布状态保持“待外部操作门槛”：本地原生检查不能替代 disposable/staging 中的真实 PostgreSQL/RLS、Storage signed upload、WASM `static_files`、OpenAI、cleanup 与生产 OAuth/Pages 冒烟。

## 2026-09-03 — DeepSeek 可切换视觉分析

- 在既有 `AiProvider` 边界内加入 DeepSeek Responses 适配器，并保留 OpenAI 适配器；生产入口只按服务端 `AI_PROVIDER=deepseek|openai` 显式选择，缺失或非法值 fail-closed，单次失败不会跨提供商自动回退。
- DeepSeek 调用固定 `https://api.deepseek.com/responses`，当前仅允许视觉模型 `deepseek-v4-flash-vision-exp`；请求支持真实产品图片和 JSON Schema 结构化结果，继续复用原有校验、一次修复重试、幂等扣次与失败退款链路。
- 安全边界不变：`DEEPSEEK_API_KEY` 只允许保存在 Supabase Edge Function Secrets。本地实现、测试、文档与 Git 历史均未写入或读取密钥值，GitHub Pages 工作流也明确禁止注入 AI Provider 配置。
- 本地验证：全量 Vitest 为 14 个测试文件、246/246 通过；三个 Edge Function 原生 Deno 测试 72/72 通过；`npm.cmd run check:edge` 与生产构建通过。构建仍只有既有 `MusicPage` 527.28 kB 的 chunk 警告。
- 发布状态：代码与本地契约已完成，DeepSeek 真实图片生成仍为“待外部操作门槛”。需在 Supabase Dashboard 保存密钥、设置非秘密 Provider 配置、重新部署 `analyze-commerce`，再以已认证账号核对模型、结果、单次扣额、日志和私有图片边界。

## 2026-09-03 — OAuth 已有账号恢复与线上验证

- 修正 GitHub OAuth Provider 配置：GitHub Client ID 与新生成的 Client Secret 已保存到 Supabase；Secret 未进入源码、构建产物或维护日志。
- 匿名访客继续优先使用 `linkIdentity()` 继承匿名数据；当 Supabase 返回 `email_exists` 或 `identity_already_exists` 时，只从 `link` 状态自动切换一次普通 OAuth 登录，`sign-in` 状态不会再次重试。
- 认证模块增加已有账号冲突和防循环回归覆盖；主项目 Vitest 14 个测试文件共 248/248 通过，Edge Function 类型检查与生产构建通过。构建仍仅保留已有 `MusicPage` 527.28 kB chunk 提醒。
- 独立代码审查结果为 Critical 0、Important 0、Minor 0。源码合并提交为 `24993f1`，GitHub Pages 发布提交为 `5efe0ae`，Pages workflow `33762017717` 成功完成。
- Playwright 已在 `https://geniusli.cn/#ai-commerce` 完成真实 GitHub OAuth 回归：已有账号自动进入 AI 电商工作台，额度可读取，“我的”菜单显示“管理后台”，证明正式会话与站长身份均生效；浏览器控制台 error/warning 为 0/0。

## 2026-09-12 — 首页与 AI 电商工作台重构发布

- 首页改为全屏 GradientWaves 与 WENHAO 粒子标题，导航收敛为五项浮动入口，并保留站内搜索、深浅主题和移动目录交互；AI 电商工作台改为“产品 → 市场 → 确认”三步布局、抽屉式历史记录与紧凑音乐入口。
- 生成流程统一为 reducer 状态机，认证请求显式携带 Bearer token 并最多静默恢复一次；OAuth 整页跳转仅短期保存同账号的纯文字草稿，绝不保存 File、base64 或令牌。上传失败、生成启动前认证失效、项目清理、跨账号与过期轮询均有回归保护。
- 源码提交为 `c951c2f`，部署提交为 `78fa017`；GitHub Pages workflow `34629989920` 成功完成。发布域名和 `CNAME` 保持为 `geniusli.cn`。
- 2026-09-12 01:53（Asia/Shanghai）线上 Playwright 冒烟通过：`https://geniusli.cn/` 与 `/#ai-commerce` 均加载新资源 `index-Cd4erOnG.js`、`index-C5wdz3mu.css`；1440、1024、390px 深浅主题无横向溢出，页面标题正确，浏览器控制台 error/warning 为 0/0，音乐 LRC 返回 200、MP3 范围请求返回 206。
- 发布前主项目 19 个测试文件共 300/300 通过，TypeScript 与 Vite 生产构建通过；构建仍只有既有的两个大于 500 kB 分块提醒。此次线上冒烟没有触发真实 OAuth 授权或会消耗额度的 AI 生成。

## 2026-10-21 — 工具导航目录本地验证

- 新增 `#tools` 工具导航页；五类十项官方入口及个人使用说明由独立的 `src/content/tools.ts` 数据模块提供，支持搜索、分类筛选与空结果重置。页面在 1080px、640px 断点调整卡片与移动布局。
- 目标框光标仅作用于显式标记的工具卡片与导航项，并受精细指针、减少动态效果、表单及模态窗口边界约束；移动触控环境不显示目标框。
- 全量 Vitest 23 个文件、317/317 通过，TypeScript 与 Vite 生产构建通过；仍有既有的两个大于 500 kB 分块提醒。真实浏览器已在 1440×1000、1024×900、390×844 的深浅主题验证页面、筛选、链接安全属性、导航当前态、无横向溢出、末卡与音乐按钮间距及移动 Escape 焦点返回。
- 已知限制：本次只验证本地 `/#tools`，未打开外部工具站点，也未推送或部署；线上可用性与外部站点内容不在此次验证范围内。

## 2026-10-23 — Field Notes 改版 Task 9 本地验证与恢复收口

- 在 `e4e2f935c74b2d75d97a640c58e3df91173389b7` 基础上逐项审计上次验证留下的 10 个未提交文件，保留并补齐触屏静态打字、44px 触控目标、文章/作品索引字号作用域、浅色导航与文章元信息对比度、留言输入区音乐避让；另补上窄屏音乐页和留言工具栏的可访问名称。没有新增依赖。
- 最终定向回归：6 个测试文件、35/35 通过（10.88 秒）。隔离截图负载后的完整 `npm.cmd test`：39 个测试文件、405/405 通过（45.06 秒），没有未处理拒绝或计时器泄漏。`npm.cmd run build` 和 `npm.cmd run check:edge` 均通过，3 个 Edge Function 入口未改动且全部通过类型检查。构建保留既有大分块提醒：主包 527.13 kB、MusicPage 527.33 kB；未引入新的大型依赖。
- 浏览器使用 Playwright CLI 独立 Chrome 会话 `task9-recovery-desktop` / `task9-recovery-touch`。深色、浅色分别覆盖 1440×1000、1024×900（精细指针）和 768×1024、390×844（触屏/粗指针）：共 8 个首页组合与 112 个非首页路由组合。首页覆盖 Hero/波浪与 WENHAO、开合 Card Nav、分组搜索、精选文章、倾斜作品卡、紧凑电商实验室、视觉随记及弹窗、写作预览、关于及页脚；非首页包含文章/作品索引、各 3 个初始详情、各 1 个 missing 路由、Tools、Guestbook、Commerce、Music。
- 120 个路由/主题/尺寸组合均无横向溢出、无小于 44px 的可见交互目标；另测弹窗/播放器/表情面板，表情按钮实测约 44.33px。键盘遍历 9 个导航目标、Ctrl+K、搜索空结果恢复、模态正反向 Tab 限制及关闭后的焦点恢复通过；工具过滤重置为 10 项、文章过滤为设计 2 / 电商 1 / 全部 3，动态 missing 恢复正确。
- 16 个尺寸/主题/动态偏好组合验证触屏或 reduced-motion 时无 Target Cursor、打字光标、粒子画布或倾斜，桌面正常模式仍保留有限动效。实际拦截图片并返回无效图像字节后，视觉随记卡片与弹窗使用带说明的生成替代图形，布局保持稳定。`?auth=guestbook` 仍解析为留言页（URL 保留查询参数，未执行 OAuth）。390px 留言/电商输入聚焦时折叠音乐入口隐藏；留言非聚焦与本地电商几何夹具保持 12px 间距，768px 保持测量避让。
- 所有业务路径只读：留言列表响应在浏览器内替换为空数组，既有自动匿名身份与认证设置请求均被网络守卫拦截；最终审计为 124 次匿名 signup POST 和 124 次 settings GET 被拦截，248 条预期 `ERR_BLOCKED_BY_CLIENT`，页面异常 0、意外 console error/warning 0。没有真实登录、留言、图片上传、生成、删除、额度或外部付费操作；真实认证后工作台业务不在本轮浏览器验证范围内。
- 最终本地预览 `http://127.0.0.1:5173/`，服务会话 `61284`。仅停止本轮已核实的旧 Vite PID 38464（原会话 31146），以进程级空白 public Supabase 配置重启同一工作区，防止用户打开预览时自动创建匿名身份；未读写任何 `.env*` 内容，未修改源码配置。已请求在应用浏览器打开，工作代理侧返回 queued，控制会话负责显示给用户。
- `git diff --check` 通过；仅本轮相关源码、测试和本日志进入提交。`output/` 保持原有未跟踪状态、未触碰；临时脚本、快照、截图与日志仅位于 `C:\Users\lenovo\AppData\Local\Temp\wenhao-field-notes-qa`。数据库、Edge Function、GitHub workflow、环境文件和密钥无变更；未推送、创建 PR、部署或改 DNS。独立最终代码审查由控制代理在本轮提交 SHA 上继续执行。

## 2026-10-24 — Field Notes Task 9 审查问题修复复核

- 根据 Task 9 独立审查发现的三项阻断问题复核并保留修复：留言操作区在悬停、键盘焦点和移动端展开时改用自适应高度/换行，不再被 21px 高度裁切；留言页音乐弹层与按钮共用实测避让位移，并限制弹层高度；播放器打开后进入进度控制、关闭后返回按钮，歌单改用共享模态边界以保证背景 inert、双向 Tab 限制、Escape 与焦点返回。补上动作区、播放器、歌单及背景点击的回归测试。
- 完整审计上轮遗留的 9 个未提交源码/测试文件（含 1 个新测试）。针对性命令 `npm.cmd test -- tests/guestbook-message-actions.test.tsx tests/music-dock.test.tsx tests/music-page-accessibility.test.tsx tests/modal-surface.test.tsx`：4 文件、26/26 通过。完整 `npm.cmd test`：40 文件、423/423 通过；`npm.cmd run build`、`npm.cmd run check:edge`、`git diff --check` 均通过。受管理沙盒的 Vitest 缓存重命名曾在断言开始前遇到 EPERM；在获准的本地执行环境中原命令通过，单 worker 重试在沙盒内仍遇到同一文件系统错误。
- Playwright CLI 在 390×844、768×1024、1024×900 的深浅主题共 6 组真实浏览器复核中，读取本地只读留言夹具并阻止所有非本机请求。操作按钮实测均为 44px；人为收窄消息气泡后操作区为 96px，子按钮无祖先裁切。音乐弹层与入口保持 10px 间距，入口与输入区保持 12px 间距，弹层位于视口内且无横向溢出。进入播放器后的前向 Tab、Escape/收起/再次点击入口/点击外部、歌单双向焦点圈定/背景 inert/关闭返回均通过；页面异常和意外 console error/warning 均为 0。
- 本地预览 `http://127.0.0.1:5173/` 在工作树中以进程级空白 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 启动，执行会话 `64293`、Vite PID `28580`，与真实 Supabase 断开；未读取、打印或修改 `.env*`。浏览器证据仅在 `C:\Users\lenovo\AppData\Local\Temp\wenhao-field-notes-qa`，未触碰用户所有的未跟踪 `output/`。未执行真实认证、数据库改写、上传、付费调用、外部跳转、推送、PR、部署或 DNS 变更。构建仍有原有的大包提示（主包 519.77 kB，MusicPage 527.36 kB），本轮未新增依赖。

## 2026-10-24 — Field Notes Task 9 输入焦点复核

- 修复音乐弹层打开后第一次点击页面表单控件时焦点被强行拉回启动按钮的问题：仅在外部点击把原生焦点交给输入框、文本域、下拉框或可编辑区域时保留该焦点；Escape、弹层内收起、启动按钮、歌单以及点击普通背景按钮仍按原规则返回。新增输入框与留言文本域两项回归，先确认两项 RED，再确认修复后 GREEN。
- `npm.cmd test -- tests/music-dock.test.tsx tests/modal-surface.test.tsx tests/music-page-accessibility.test.tsx`：3 文件、25/25 通过；完整 `npm.cmd test`：40 文件、425/425 通过。`npm.cmd run build`、`npm.cmd run check:edge`、`git diff --check` 通过；仍为原有主包 520.04 kB / MusicPage 527.36 kB 大分块提示，未新增依赖。
- 使用复用的本机安全预览（127.0.0.1:5173，Vite PID 28580，进程级空白 Supabase public 配置）和 Playwright CLI，在 390×844 深浅主题实际点击打开播放器，再第一次点击留言框；两种主题均确认弹层收起、留言框保持焦点、移动端启动按钮隐藏。浏览器 page exception、console error/warning 和被阻止的远端请求均为 0。浏览器证据仅存于 `C:\Users\lenovo\AppData\Local\Temp\wenhao-field-notes-qa`；未触碰 `output/`，未执行真实认证、留言写入、上传或外部操作。

## 2026-10-26 — Field Notes 最终审查缺口收口

- 在既定设计/计划下审计并保留最终审查修复：延迟加载的文章/作品 CSS 仅作用于阅读页；481–760px 作品索引卡片由链接自身承载双列；新增提交后滚动边界，缓存详情/索引回到顶部、首页锚点在挂载后落位；视觉随记等模态打开时 Ctrl/Cmd+K 不再启动搜索。文章索引按日期复制排序；作品图像在首页、索引、详情共用定尺寸且带说明的错误后备；普通文章/作品索引链接移除 Target Cursor 标记。补齐不同日期的七条乱序内容、滚动、弹窗和图像错误回归。未修改业务/数据库逻辑或新增依赖。
- 独立复跑聚焦 `10` 文件 `62/62`、完整 `43` 文件 `439/439`；`npm.cmd run build`、三个 Edge Function 的 `npm.cmd run check:edge`、`git diff --check` 均通过。构建仍有已有的大分块提示：主包 `520.15 kB`、音乐页 `527.36 kB`。
- Playwright CLI 在真实 `600×900` 深色页面测得作品卡图片 `181.55px`、文案 `352.45px` 双列，无横向溢出；`1024×900` 深浅主题逐项走过阅读页→工具/留言/电商及相反加载顺序。已滚动 `700px` 的文章、项目和索引切换后均回到 `0`；首页锚点、后退/前进、视觉随记模态下 Ctrl/Cmd+K 抑制及关闭后搜索恢复通过。控制台 error/warning `0/0`；动态请求仅本机音乐资源，LRC 一次取消后重试 `200`、MP3 `206`，没有意外远端请求。
- 安全预览为 `http://127.0.0.1:5174/`（Vite PID `34612`，启动包装 PID `3260`），仅绑定本机且进程级 Supabase public 环境值为空白。首次尝试的 `5173` 被占用，本轮未终止该端口上的任何进程。浏览器证据仅在 `C:\Users\lenovo\AppData\Local\Temp\wenhao-field-notes-qa`；未查看、打印或修改 `.env*` 内容，未触碰或暂存用户的 `output/`，未登录、写入后端、上传、调用付费接口、打开外站、推送或部署。详见忽略目录中的 `final-fix-report.md`。
## 2026-10-28 — Motion and loading polish 本地自动验证（浏览器待补）

### 浏览器补验（替代下方“未进行真实浏览器验证”的状态）

- Playwright CLI 本地 Chromium，127.0.0.1:4181，外部请求阻断。五个路由在各自新上下文延迟页面模块 1200ms：遮罩均为 `[0,0,1440,1000]`、z-index 1000、文案正确，左上命中遮罩；Tab 焦点留在 body，遮罩期间 shell 兄弟节点 inert，退出后 shell 子节点 inert 均恢复。加载至退出分别 2379、3048、2404、2500、2477ms（包含导航及延迟，不能作为精确最低时长）；同上下文返回首页再访问五条路由，150ms 检查均无遮罩。预先存在的关闭导航及音乐面板仍保持各自 inert。
- 深浅主题各测 1440×1000、1024×900、768×1024、390×844：搜索与主题图标中心分别为 43px（1440）或 37px（其余）；1440 的快捷键中心亦为 43px，其他尺寸快捷键隐藏。按钮高度均 44px，搜索按钮宽度 95.66px 或 44px，主题按钮宽度 44px；胶囊右侧边距分别约 100.34、12、12、12px。文档宽度等于视口，无横向溢出。这里只测量了胶囊按钮，未逐个审计所有页面控件或裁切。
- 粒子标题从 forming 到 settled；鼠标移入、点击、Enter、Space 后均再次进入 forming，键盘焦点保留。Canvas 获取、像素采样、ResizeObserver 构造分别注入失败时显示可读 WENHAO fallback，无页面异常；减少动态为无 canvas 静态标题，粗指针上下文标题可读并进入 settled。未逐粒子量化局部位移、每次完整回聚、空闲帧或粗指针点击。
- 22 秒内观测到最终语句完整出现三次，三次均逐字删至空后从“记”重新开始；模拟 hidden 700ms 时当前文字不变，恢复后继续变化。加载中模拟 visibilitychange 后出现 is-page-hidden，进度动画状态 paused；恢复后类移除并正常完成。波浪测试误取伪元素，粒子帧暂停未实测，不能据此声明通过。
- 工具路由减少动态时静态 wordmark 与底色完整；注入 Canvas/采样失败时遮罩文案、静态 WENHAO 和渐变完整、无页面异常。总导航耗时普通 1811ms、减少动态 1268ms（含网络和页面初始化，不足以独立证明 120ms 退出或无最低延迟）。捕获的路由和标题测试 console warning/error 与 page exception 为零；未完整覆盖退出中 Tab、指针阻断及所有主题交互。预览与浏览器已关闭，4181 无监听；仅临时目录存放测试脚本与浏览器产物，`output/` 未触碰。

- 实现范围 `91f1259..2d63987`（含 `91f1259`；基线 HEAD `2d639879c75f82b7400dc9a2e2af2e1250383e45`）。聚焦命令 `npm.cmd test -- tests/route-loading-screen.test.tsx tests/particle-text.test.tsx tests/text-type.test.tsx tests/card-navigation.test.tsx tests/homepage-content.test.tsx tests/homepage-editorial.test.tsx tests/cross-page-shell.test.tsx tests/app-scroll.test.tsx tests/motion-profile.test.tsx tests/gradient-waves.test.tsx`：10 文件、75/75 通过；`npm.cmd test`：44 文件、464/464 通过。分别出现 9 和 15 条 jsdom Canvas `getContext()` 未实现提示；未见未处理拒绝、计时器泄漏或孤立动画帧警告。
- `npm.cmd run build` 通过（218 模块）；保留大于 500 kB 的分块警告：index 524.28 kB、MusicPage 527.36 kB。`npm.cmd run check:edge` 的三个入口均通过；`git diff --check` 通过。
- 使用进程级空白 Supabase public 值在 `127.0.0.1:4179` 启动预览并确认 HTTP 200，随后停止进程树。Playwright CLI 启动无输出且未建立会话，因此五个加载路由、缓存回访、遮罩及控件几何、焦点隔离、隐藏标签、粒子与打字循环、减少动态、粗指针、Canvas/observer 后备、双主题四尺寸、溢出及浏览器控制台均未进行真实浏览器验证；不能认定通过。自动化结果不替代这些检查。
- 未读取或编辑 `.env*`，未触碰或暂存用户原有的 `output/`；未操作后端、认证、密钥、远程 Git 或生产环境。未测试真实登录、持久化、生成、上传、付费 API 或外部导航。

## 2026-10-29 — Motion/loading Task 5 第二轮修复及定向浏览器收口

- 基线 `fb959167cf8b91825a1c803d2500bfab3e147b8b`。实测发现全局 reduced-motion `transition-duration:.01ms!important` 覆盖加载层 120ms 淡出；仅给 `.route-loading-screen.is-reduced-motion.is-leaving` 的 `transition: opacity 120ms linear` 增加 `!important`，不削弱全局策略、不改普通模式。新增源样式回归锁定多类选择器、精确 opacity-only/120ms/linear/important、无 transform 及普通 360ms 双属性。
- TDD：`npm.cmd test -- tests/route-loading-screen.test.tsx` 修复前为 1 failed/11 passed，断言明确缺少 important（此前一次缓存 EPERM、一次测试 URL 路径错误已隔离修正，不作为 RED）；修复后执行上一节同一 10 文件聚焦命令为 76/76，完整 `npm.cmd test` 为 44 文件 465/465。测试进程 TEMP/TMP 指向临时 QA 目录以避开受限缓存重命名错误。聚焦/完整分别保留原有 9/15 条 jsdom Canvas 未实现提示，无泄漏或未处理拒绝警告。
- `npm.cmd run build` 通过、218 模块，仍为 index 524.28 kB / MusicPage 527.36 kB 已有大包提示；`npm.cmd run check:edge` 三入口通过，`git diff --check` 通过。
- Playwright CLI 在本机 127.0.0.1:4182 安全预览（进程级空白 Supabase public 值、所有非 127.0.0.1 页面请求阻断）新上下文延迟工具页模块。真实 `.route-loading-waves` Animation/currentTime：隐藏前 325.304ms，隐藏稳定后 341.804ms，继续隐藏 600ms 仍为 341.804ms，恢复 300ms 后 616.572ms；playState paused→running。对应加载层 canvas clearRect 绘制数 30→31→31→41，证实形成中的粒子隐藏暂停、显示恢复并正常完成。隐藏为模拟 document.hidden/visibilitychange，不宣称操作系统后台节流测试。
- 正常退出 computed transition 为 `opacity 0.36s, transform 0.36s`，ease/ease，is-leaving 到移除 362.1ms。导航前 emulate reduce 后，computed 为 `opacity 0.12s linear`、property opacity、duration 0.12s、transform none，移除差 122.6ms（非整次导航耗时）。仅验证这一受控工具路由的精确退出；最低延迟/缓存及其他路由仍以前轮证据和自动测试支持。
- 退出中连续两次真实 Tab 后 activeElement=BODY，shell 全部非遮罩直接子节点 inert；真实点击 (50,50) 捕获 target 为 `route-loading-screen is-leaving`，同一时刻仍在退出且背景不可交互。移除后四个 shell 子节点 inert 均 false，搜索按钮真实 focus 成功。无背景 header/route/music 控件获得焦点或点击。
- 精细指针 1440×1000：记录 6055 个粒子绘制坐标，指针 70px 内 490 粒子位移均值 5.136px、最大 8.916px；130px 外 5094 粒子最大 0.156px（有限形成的残差，非显著远端扰动）。移开并回聚后 800ms，draws 85→85、ParticleText RAF callbacks 83→83、pending 0→0；无页面异常。另测 hover/click/Enter/Space 各形成后回到 settled，click/键盘保持焦点；390×844 真实 hasTouch/isMobile 上下文 tap 后 forming→settled，非无限循环。
- 四尺寸×深浅主题共八组补测全部可见胶囊后代的元素/文字 Range 矩形及真实裁切祖先，裁切与横向溢出均零；按钮最小 44×44px。胶囊 [x,y,w,h] 分别为 [1188.344,16,151.656,54]、[912,10,100,54]、[656,10,100,54]、[278,10,100,54]，主题不影响几何。图标及 kbd 的 scrollHeight 分别超过本身 line box 3–5px/2px，但 overflow visible、文字在所有裁切祖先内，不能将其误报为裁切；390px 浅色截图也已检查。
- 本轮不重跑真实后端/认证/上传/生成/付费 API/外站或全站所有控件审计；前轮 Canvas/采样/observer fallback、五路由及打字循环证据保留。有限时间窗观测不保证所有设备/浏览器。全部临时脚本、快照及截图仅在 `C:\Users\lenovo\AppData\Local\Temp\wenhao-motion-loading-qa`；未读写 `.env*`、未触碰或暂存 `output/`，无后端、密钥、远程 Git 或生产变更。
- 清理：停止本轮预览会话后，在浏览器所在主机环境确认 CLI default 已关闭、list 无浏览器，4182 无监听；关闭命令曾两次权限审核超时，普通受限环境无法观察主机会话，最终在同一主机环境完成关闭及复核。自查仅样式、回归测试、项目日志进入提交。
