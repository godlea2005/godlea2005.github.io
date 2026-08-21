# AI 电商设计工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `geniusli.cn` 内交付可登录、可上传产品图、可调用多模态 AI、可生成平台化视觉方案、可扣次和可由站长管理的 AI 电商设计工作台。

**Architecture:** 现有 React/Vite 单页站继续使用 hash 路由，新增独立 `commerce` 领域模块，并把留言板中的 OAuth 会话能力提升为全站身份上下文。浏览器只通过 Supabase Auth、私有 Storage、受 RLS 保护的表和 Edge Function 工作；AI 密钥、服务角色密钥及清理密钥只存在于 Supabase Secrets。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Testing Library、Supabase Auth/PostgreSQL/Storage/Edge Functions、Deno、OpenAI Responses API 适配器、Playwright CLI、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-08-21-ai-commerce-studio-design.md`

## 全局约束

- 首发平台固定为 Ozon、Wildberries、抖音电商、淘宝/天猫。
- 快速模式上传 1–6 张图、填写产品名称和目标平台；专业模式增加参数、价格、人群、品牌调性、卖点、竞品链接、禁用词和风格。
- 单图最大 8 MB，只接受 JPEG、PNG、WebP；产品图存放在私有 `commerce-assets` bucket。
- AI 结果必须区分用户事实与模型推测，严禁虚构尺寸、材质、认证、功效及性能参数。
- 提交分析前必须明确告知用户：产品图片会通过短期签名地址发送给当前 AI 服务商进行分析；用户须确认拥有素材权利并同意该次处理。
- 新用户默认赠送 3 次；成功任务扣 1 次，失败任务不扣或自动退还；同一幂等键不得重复扣次。
- 图片默认 7 天到期；达到可配置存储软上限时，按最早上传顺序删除非处理中、非锁定图片；文字结果保留。
- 普通用户只能读写自己的项目、资源、任务与额度；后台权限必须在数据库或 Edge Function 验证。
- 页面兼容深浅模式、桌面端和 390px 手机宽度，并尊重 `prefers-reduced-motion`。
- 首版不直接生成图片、不支付、不做团队账号、不做复杂 PDF/PSD 导出。
- 每个任务只暂存该任务列出的文件，不暂存 `.deploy-worktree/`。

## 文件结构

```text
src/
  auth/
    AuthProvider.tsx              全站会话、OAuth、站长身份与登录弹层状态
    AuthDialog.tsx                GitHub/Google 登录界面
    auth.css                      登录弹层样式
  commerce/
    types.ts                      平台、输入、任务与 AI 结果契约
    commerceRepository.ts         项目、额度、任务、Storage 与后台数据访问
    validation.ts                 文件、字段、平台及结果运行时校验
    CommerceStudioPage.tsx        工作台页面编排
    CommerceProjectForm.tsx       快速/专业表单与图片上传
    CommerceResult.tsx            结构化结果展示和复制
    CommerceHistory.tsx           历史项目及资源清理状态
    CommerceAdminPage.tsx         站长概览、用户、任务和设置
    commerce.css                  工作台、结果、后台及响应式视觉
  components/
    CommerceHomeSection.tsx       首页工具价值、平台和三步流程
  test/
    setup.ts                      jsdom 与 Testing Library 初始化
supabase/
  config.toml                       本地 Edge Runtime 与函数鉴权配置
  migrations/
    202608210001_ai_commerce.sql  数据表、RLS、Storage、RPC、默认设置与平台预设
  functions/
    _shared/cors.ts               Edge Function CORS
    _shared/result-schema.ts      AI 结构化输出 JSON Schema
    _shared/commerce-prompt.ts    平台化系统提示构建
    _shared/ai-provider.ts        多模态模型适配接口与 OpenAI 实现
    analyze-commerce/index.ts     身份校验、扣次、签名图片、AI 调用和任务落库
    cleanup-commerce-assets/index.ts 私有图片到期/软上限清理
tests/
  commerce-validation.test.ts     领域校验单元测试
  commerce-repository.test.ts     Repository 调用契约测试
  commerce-form.test.tsx          表单与认证门槛测试
  commerce-result.test.tsx        结构化结果与复制测试
  auth-provider.test.tsx          OAuth 回调与身份状态测试
.github/workflows/
  cleanup-commerce-assets.yml     每日清理触发器
```

---

### 任务 1：测试基线与领域契约

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/commerce/types.ts`
- Create: `src/commerce/validation.ts`
- Create: `tests/commerce-validation.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `CommercePlatform`、`CommerceProjectInput`、`CommerceResult`、`validateProjectInput(input)`、`validateProductFile(file)`、`isCommerceResult(value)`。

- [ ] **Step 1: 安装并配置测试工具**

Run:

```powershell
npm.cmd install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

在 `package.json` 增加：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

在 `vite.config.ts` 的 `defineConfig` 中增加：

```ts
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
  css: true,
}
```

`src/test/setup.ts` 内容固定为：

```ts
import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})
```

- [ ] **Step 2: 编写失败的领域校验测试**

```ts
import { describe, expect, it } from 'vitest'
import { isCommerceResult, validateProductFile, validateProjectInput } from '../src/commerce/validation'

describe('commerce validation', () => {
  it('requires one to six images and a product name', () => {
    expect(validateProjectInput({ mode: 'quick', name: '', platform: 'ozon', files: [] }).ok).toBe(false)
  })

  it('rejects unsupported and oversized files', () => {
    expect(validateProductFile(new File(['x'], 'a.svg', { type: 'image/svg+xml' })).ok).toBe(false)
    const large = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })
    expect(validateProductFile(large).ok).toBe(false)
  })

  it('rejects incomplete AI results', () => {
    expect(isCommerceResult({ productSummary: '杯子' })).toBe(false)
  })
})
```

- [ ] **Step 3: 运行测试并确认因模块不存在而失败**

Run: `npm.cmd test -- tests/commerce-validation.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../src/commerce/validation'`。

- [ ] **Step 4: 实现完整领域类型与运行时校验**

`CommerceResult` 固定包含以下字段，不允许结果页自行猜测字段：

```ts
export type CommercePlatform = 'ozon' | 'wildberries' | 'douyin' | 'taobao-tmall'
export type ProjectMode = 'quick' | 'professional'
export type Confidence = 'confirmed' | 'inferred' | 'needs-confirmation'

export type CommerceProjectInput = {
  mode: ProjectMode
  name: string
  platform: CommercePlatform
  files: File[]
  category?: string
  specifications?: string
  priceRange?: string
  sellingPoints?: string
  audience?: string
  brandTone?: string
  competitorLinks?: string
  prohibitedWords?: string
  desiredStyle?: string
  notes?: string
}

export type HeroDirection = {
  title: string
  rationale: string
  composition: string
  background: string
  palette: string[]
  lighting: string
  props: string[]
  copyPlacement: string
  visualFocus: string
  imagePrompt: string
  negativePrompt: string
}

export type DetailFrame = {
  order: number
  purpose: string
  visual: string
  copy: string
  copyTranslation: string | null
  transition: string
}

export type CommerceResult = {
  productSummary: string
  facts: Array<{ label: string; value: string; confidence: Confidence }>
  audiences: Array<{ segment: string; motivation: string }>
  sellingPoints: Array<{ rank: number; point: string; reason: string; confidence: Confidence }>
  platformStrategy: { overview: string; contentDensity: string; tone: string; complianceNotes: string[] }
  heroDirections: [HeroDirection, HeroDirection, HeroDirection]
  detailFrames: DetailFrame[]
  recommendedCanvas: Array<{ usage: string; ratio: string; pixels: string; safeZone: string }>
  fidelityRules: string[]
  pendingConfirmations: string[]
}
```

校验规则：名称去空格后 1–80 字、文件数 1–6、单文件不超过 `8 * 1024 * 1024`、MIME 只允许 `image/jpeg|image/png|image/webp`、专业文本字段单项不超过 2000 字、详情分镜必须为 8–12 条、主图方向必须恰好 3 条。

- [ ] **Step 5: 运行单测和构建**

Run: `npm.cmd test -- tests/commerce-validation.test.ts`

Expected: 3 tests PASS。

Run: `npm.cmd run build`

Expected: TypeScript 与 Vite build PASS。

- [ ] **Step 6: 提交任务 1**

```powershell
git add package.json package-lock.json vite.config.ts src/test/setup.ts src/commerce/types.ts src/commerce/validation.ts tests/commerce-validation.test.ts
git commit -m "test: establish commerce domain contracts"
```

---

### 任务 2：Supabase 数据、额度事务与私有 Storage

**Files:**
- Create: `supabase/migrations/202608210001_ai_commerce.sql`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: `CommercePlatform` 对应数据库枚举文本值。
- Produces: 表 `site_admins`、`user_entitlements`、`credit_ledger`、`commerce_projects`、`commerce_project_assets`、`commerce_generations`、`platform_presets`、`app_settings`、`cleanup_runs`、`admin_audit_log`；RPC `site_is_admin()`、`get_my_entitlement()`、`begin_commerce_generation(uuid,text)`、`complete_commerce_generation(uuid,jsonb,text,text,jsonb)`、`fail_commerce_generation(uuid,text,text)`、`delete_commerce_project(uuid)`、`admin_commerce_overview()`、`admin_list_users(text,int,int)`、`admin_list_generations(text,int,int)`、`admin_get_settings()`、`admin_set_entitlement(uuid,int,boolean,boolean,text)`、`admin_update_settings(jsonb,text)`。

- [ ] **Step 1: 编写迁移中的表和约束**

迁移必须使用以下关键约束：

```sql
create table public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 3 check (credits >= 0),
  unlimited boolean not null default false,
  disabled boolean not null default false,
  daily_limit integer not null default 10 check (daily_limit between 1 and 1000),
  updated_at timestamptz not null default now()
);

create table public.commerce_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  platform text not null check (platform in ('ozon','wildberries','douyin','taobao-tmall')),
  mode text not null check (mode in ('quick','professional')),
  input_data jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commerce_project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.commerce_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 8388608),
  expires_at timestamptz not null default (now() + interval '7 days'),
  state text not null default 'ready' check (state in ('uploading','ready','processing','deleted','failed')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
```

`commerce_generations.idempotency_key` 添加 `unique(user_id, idempotency_key)`；`credit_ledger.delta` 不得为 0；平台预设插入四行；`app_settings` 插入 `new_user_credits=3`、`default_daily_limit=10`、`max_project_images=6`、`storage_soft_limit_bytes=800000000`、`storage_target_bytes=650000000`。

- [ ] **Step 2: 实现新用户初始化和额度事务**

`handle_new_commerce_user()` 由 `auth.users after insert` 触发，使用 PostgreSQL `ON CONFLICT DO NOTHING` 保证 `user_entitlements` 只初始化一次，并写 `credit_ledger(reason='signup_grant')`。

`begin_commerce_generation` 在单个事务函数中：验证 `auth.uid()`、项目归属、账号未禁用、当日任务数低于 `daily_limit`；遇到已有幂等键直接返回已有任务；非无限用户用 `update public.user_entitlements set credits = credits - 1, updated_at = now() where user_id = auth.uid() and credits > 0 returning credits` 原子扣次；插入 `credit_ledger(delta=-1, reason='generation')` 和 `commerce_generations(status='queued')`。

函数返回固定表结构 `table(generation_id uuid, status text, charged boolean)`；首次创建时 `charged=true`，重复幂等请求返回原任务且 `charged=false`。

`fail_commerce_generation` 只允许 `service_role`，并通过 `refunded_at is null` 保证最多退款一次；非无限任务将额度加 1 并写 `credit_ledger(delta=1, reason='generation_refund')`。

- [ ] **Step 3: 配置 RLS、RPC 权限与私有 bucket**

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('commerce-assets', 'commerce-assets', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
```

用户表策略统一使用 `(select auth.uid()) = user_id`；Storage insert/select/delete 要求 bucket 为 `commerce-assets` 且第一层目录等于当前用户 UUID；`site_admins` 不直接 grant select；管理员读取与写入通过 security definer RPC；`complete_commerce_generation` 和 `fail_commerce_generation` 只 grant 给 `service_role`。

- [ ] **Step 4: 在 Supabase README 写明可复现部署与站长迁移**

README 给出以下命令和 SQL：

```powershell
npx.cmd supabase link --project-ref ujwwwqlpwdplulzslgpi
npx.cmd supabase db push
```

```sql
insert into public.site_admins (user_id)
select user_id from public.guestbook_admins
on conflict (user_id) do nothing;
```

- [ ] **Step 5: 做迁移静态检查**

Run:

```powershell
Select-String -Path supabase/migrations/202608210001_ai_commerce.sql -Pattern "enable row level security|service_role|7 days|storage_soft_limit_bytes|wildberries|taobao-tmall"
```

Expected: 每个关键安全与产品约束均有匹配；迁移中不存在公开产品图 bucket。

- [ ] **Step 6: 提交任务 2**

```powershell
git add supabase/migrations/202608210001_ai_commerce.sql supabase/README.md
git commit -m "feat: add secure commerce data model"
```

---

### 任务 3：全站身份上下文与登录门槛

**Files:**
- Create: `src/auth/AuthProvider.tsx`
- Create: `src/auth/AuthDialog.tsx`
- Create: `src/auth/auth.css`
- Create: `tests/auth-provider.test.tsx`
- Modify: `src/main.tsx`
- Modify: `src/guestbook/GuestbookAuth.tsx`
- Modify: `src/guestbook/types.ts`
- Modify: `src/components/GuestbookPage.tsx`

**Interfaces:**
- Consumes: `supabase`、`getSocialProviderStatus()`、RPC `site_is_admin()`。
- Produces: `useAuth()`，返回 `{ ready, user, isAnonymous, isAdmin, provider, providers, error, signIn, signOut, requireLogin }`；`AuthDialog`。

- [ ] **Step 1: 编写失败的 OAuth 和权限测试**

```tsx
it('opens login when a protected action is requested', async () => {
  render(<AuthProvider><ProtectedProbe /></AuthProvider>)
  await userEvent.click(screen.getByRole('button', { name: '开始分析' }))
  expect(screen.getByRole('dialog', { name: '登录后继续' })).toBeInTheDocument()
})

it('does not trust app metadata for admin state', async () => {
  mockSession({ app_metadata: { role: 'admin' } })
  mockRpc('site_is_admin', false)
  render(<AuthProvider><AdminProbe /></AuthProvider>)
  expect(await screen.findByText('普通用户')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- tests/auth-provider.test.tsx`

Expected: FAIL，缺少 `AuthProvider`。

- [ ] **Step 3: 抽取全站 AuthProvider**

保留现有 PKCE 流程和 `sb_flow_id` 交换逻辑，但回调 URL 改为：

```ts
const getRedirectUrl = () => `${window.location.origin}${window.location.pathname}?auth=site`
```

OAuth 完成后读取 `sessionStorage['wenhao-site:return-hash']`，默认回到 `#ai-commerce`；管理员身份只接受 `supabase.rpc('site_is_admin')` 返回值。`requireLogin(returnHash)` 在未登录或匿名时打开 `AuthDialog`，已登录时返回 `true`。

- [ ] **Step 4: 让留言板消费全站身份而不是创建第二个会话监听**

`GuestbookAuthProvider` 保留旧 context 签名以减少页面改动，但 `connect`、`disconnect`、`userId`、`provider` 从 `useAuth()` 映射；留言板专属 `isOwner` 改为全站 `isAdmin`。删除留言板文件中的 OAuth 回调交换、匿名 session 互斥 Promise 与第二个 `onAuthStateChange`。

- [ ] **Step 5: 在应用根部挂载身份层并运行测试**

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <MusicProvider>
        <App />
      </MusicProvider>
    </AuthProvider>
  </StrictMode>,
)
```

Run: `npm.cmd test -- tests/auth-provider.test.tsx`

Expected: tests PASS。

Run: `npm.cmd run build`

Expected: PASS，留言板类型无回归。

- [ ] **Step 6: 提交任务 3**

```powershell
git add src/auth src/main.tsx src/guestbook/GuestbookAuth.tsx src/guestbook/types.ts src/components/GuestbookPage.tsx tests/auth-provider.test.tsx
git commit -m "feat: introduce site-wide authentication"
```

---

### 任务 4：Commerce Repository 与安全上传

**Files:**
- Create: `src/commerce/commerceRepository.ts`
- Create: `tests/commerce-repository.test.ts`
- Modify: `src/commerce/types.ts`

**Interfaces:**
- Consumes: Supabase 表/RPC、`validateProductFile`。
- Produces: `commerceRepository.getEntitlement()`、`createProject(input)`、`uploadAssets(projectId, files, onProgress)`、`startGeneration(projectId, idempotencyKey)`、`getGeneration(id)`、`listProjects()`、`deleteProject(id)`、`setProjectLocked(id, locked)`、`getAdminDashboard()`、`setUserEntitlement(input)`、`updateAdminSettings(settings, reason)`。

- [ ] **Step 1: 编写 Repository 合约测试**

```ts
it('stores images under the authenticated user and project path', async () => {
  mockUserId('user-1')
  const file = new File(['png'], '产品 图.png', { type: 'image/png' })
  await commerceRepository.uploadAssets('project-1', [file], () => undefined)
  expect(storageUpload).toHaveBeenCalledWith(
    expect.stringMatching(/^user-1\/project-1\/[0-9a-f-]+\.png$/),
    file,
    expect.objectContaining({ contentType: 'image/png', upsert: false }),
  )
})

it('invokes the Edge Function without sending a service key', async () => {
  await commerceRepository.startGeneration('project-1', 'request-1')
  expect(functionInvoke).toHaveBeenCalledWith('analyze-commerce', {
    body: { projectId: 'project-1', idempotencyKey: 'request-1' },
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- tests/commerce-repository.test.ts`

Expected: FAIL，缺少 Repository。

- [ ] **Step 3: 实现项目、资源和生成访问**

图片路径固定为 `${user.id}/${projectId}/${crypto.randomUUID()}.${extension}`。先向 `commerce_project_assets` 插入 `state='uploading'`，Storage 成功后改为 `ready`；Storage 失败则把记录标为 `failed` 并抛出中文错误。删除项目先调用 RPC `delete_commerce_project`，由数据库记录待删除资源，Edge Function 执行实际 Storage 删除。

`startGeneration` 只调用 Edge Function，不在浏览器扣额度；`getGeneration` 只 select 当前用户可见字段；所有 Supabase 错误经 `mapCommerceError` 转成登录失效、次数不足、频率限制、图片过期、网络失败五类可行动提示。

- [ ] **Step 4: 实现后台访问函数**

`getAdminDashboard()` 并行调用 `admin_commerce_overview`、`admin_list_users`、`admin_list_generations`、`admin_get_settings`；`setUserEntitlement` 只调用 `admin_set_entitlement`，参数固定为 `{ p_user_id, p_credits, p_unlimited, p_disabled, p_reason }`。

- [ ] **Step 5: 运行测试和构建**

Run: `npm.cmd test -- tests/commerce-repository.test.ts`

Expected: tests PASS。

Run: `npm.cmd run build`

Expected: PASS。

- [ ] **Step 6: 提交任务 4**

```powershell
git add src/commerce/types.ts src/commerce/commerceRepository.ts tests/commerce-repository.test.ts
git commit -m "feat: add commerce data repository"
```

---

### 任务 5：AI 分析 Edge Function

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/result-schema.ts`
- Create: `supabase/functions/_shared/commerce-prompt.ts`
- Create: `supabase/functions/_shared/ai-provider.ts`
- Create: `supabase/functions/analyze-commerce/index.ts`
- Create: `supabase/functions/analyze-commerce/index.test.ts`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: body `{ projectId: string; idempotencyKey: string }`、RPC `begin_commerce_generation`、`complete_commerce_generation`、`fail_commerce_generation`、私有资源和平台预设。
- Produces: HTTP 202 `{ generationId, status }` 或结构化错误 `{ code, message }`；`AiProvider.generate(input): Promise<{ result, model, usage }>`。

- [ ] **Step 1: 编写 Prompt 与响应校验测试**

```ts
Deno.test('Russian platforms require Russian copy and Chinese translation', () => {
  const prompt = buildCommercePrompt({ platform: 'ozon', mode: 'quick', project: baseProject, preset: ozonPreset })
  assertStringIncludes(prompt, '俄文画面文案')
  assertStringIncludes(prompt, '中文解释')
  assertStringIncludes(prompt, '不得推测认证、材质、尺寸、功效或性能')
})

Deno.test('result schema fixes three hero directions and 8-12 detail frames', () => {
  assertEquals(COMMERCE_RESULT_SCHEMA.properties.heroDirections.minItems, 3)
  assertEquals(COMMERCE_RESULT_SCHEMA.properties.heroDirections.maxItems, 3)
  assertEquals(COMMERCE_RESULT_SCHEMA.properties.detailFrames.minItems, 8)
  assertEquals(COMMERCE_RESULT_SCHEMA.properties.detailFrames.maxItems, 12)
})
```

- [ ] **Step 2: 实现可替换 AI Provider**

```ts
export interface AiProvider {
  generate(input: {
    prompt: string
    imageUrls: string[]
    schema: Record<string, unknown>
  }): Promise<{ result: unknown; model: string; usage: Record<string, number> }>
}
```

OpenAI 实现使用 `POST https://api.openai.com/v1/responses`，模型从 `OPENAI_MODEL` Secret 读取，缺省为 `gpt-5.4-mini`；图像作为 `input_image` URL；文本作为 `input_text`；请求设置 `store: false`；结构化输出使用 `text.format={ type: 'json_schema', name: 'commerce_result', strict: true, schema }`。密钥只从 `Deno.env.get('OPENAI_API_KEY')` 获取。

实现时以 [Responses API 创建响应](https://developers.openai.com/api/reference/resources/responses/methods/create) 和 [GPT-5.4 mini 模型能力](https://developers.openai.com/api/docs/models/gpt-5.4-mini) 为准；该模型支持图片输入、Responses API 和 Structured Outputs。

- [ ] **Step 3: 实现 analyze-commerce 请求闭环**

请求处理顺序固定为：验证 `POST` 与 Origin → 用传入 Authorization 创建用户客户端 → 验证用户非匿名 → 调用 `begin_commerce_generation` → 得到 generation ID → 使用 `EdgeRuntime.waitUntil(processGeneration({ generationId, userId }))` 注册后台任务 → 立即返回 HTTP 202 `{ generationId, status: 'queued' }`。`processGeneration` 的参数类型固定为 `{ generationId: string; userId: string }`，返回 `Promise<void>`。

`processGeneration` 内部顺序固定为：读取项目/资源/预设 → 用 service role 为每张图生成 10 分钟 signed URL → 将资源状态改为 `processing` → AI 调用 → 用共享校验器验证结果 → 校验失败时仅重试一次 → `complete_commerce_generation` → 资源恢复 `ready`。后台任务自身必须用 `try/catch/finally` 完成退款和资源状态恢复，不依赖请求 handler 捕获异步异常。

进入后台任务前的异常返回 `401/402/409/422/429/500` 中匹配的状态码；后台任务异常必须把处理中的资源恢复 `ready` 并调用 `fail_commerce_generation`。任何响应都不得包含 AI 密钥、signed URL、service role key 或模型原始堆栈。

`supabase/config.toml` 设置：

```toml
[edge_runtime]
policy = "per_worker"

[functions.analyze-commerce]
verify_jwt = false
```

函数仍需在内部使用 Bearer token 调用 `auth.getUser()`；`verify_jwt=false` 是为兼容当前 publishable key，不能代替应用层身份校验。背景任务实现遵循 [Supabase Background Tasks](https://supabase.com/docs/guides/functions/background-tasks)。

- [ ] **Step 4: 写入 Secrets 与部署说明**

```powershell
npx.cmd supabase secrets set "OPENAI_API_KEY=$env:OPENAI_API_KEY" "OPENAI_MODEL=gpt-5.4-mini" "ALLOWED_ORIGINS=https://geniusli.cn,http://127.0.0.1:5173"
npx.cmd supabase functions deploy analyze-commerce
```

说明中明确先在本机设置进程环境变量 `OPENAI_API_KEY`，不能把密钥写入 `.env.local`、Git、前端变量或聊天记录。

- [ ] **Step 5: 运行 Deno 测试与静态密钥扫描**

Run: `deno test supabase/functions/analyze-commerce/index.test.ts`

Expected: tests PASS。

Run:

```powershell
Select-String -Path src/**/*,supabase/functions/**/* -Pattern "sk-[A-Za-z0-9]" -ErrorAction SilentlyContinue
```

Expected: no matches。

- [ ] **Step 6: 提交任务 5**

```powershell
git add supabase/config.toml supabase/functions supabase/README.md
git commit -m "feat: add multimodal commerce analysis function"
```

---

### 任务 6：工作台表单、上传与任务状态

**Files:**
- Create: `src/commerce/CommerceStudioPage.tsx`
- Create: `src/commerce/CommerceProjectForm.tsx`
- Create: `src/commerce/commerce.css`
- Create: `tests/commerce-form.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/FloatingHeader.tsx`
- Modify: `src/components/floating-header.css`

**Interfaces:**
- Consumes: `useAuth()`、领域校验、Repository。
- Produces: `#ai-commerce` 页面、`CommerceProjectForm`、上传进度、任务轮询状态；导航主入口“AI 电商设计”。

- [ ] **Step 1: 编写表单失败测试**

```tsx
it('keeps analysis disabled until required quick fields are complete', async () => {
  render(<CommerceProjectForm onSubmitted={vi.fn()} />)
  expect(screen.getByRole('button', { name: '生成视觉方案' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('产品名称'), '保温杯')
  await userEvent.upload(screen.getByLabelText('上传产品图'), new File(['x'], 'cup.png', { type: 'image/png' }))
  expect(screen.getByRole('button', { name: '生成视觉方案' })).toBeEnabled()
})

it('reveals professional-only fields without losing quick input', async () => {
  render(<CommerceProjectForm onSubmitted={vi.fn()} />)
  await userEvent.type(screen.getByLabelText('产品名称'), '旅行杯')
  await userEvent.click(screen.getByRole('tab', { name: '专业模式' }))
  expect(screen.getByDisplayValue('旅行杯')).toBeInTheDocument()
  expect(screen.getByLabelText('禁用词与禁改细节')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- tests/commerce-form.test.tsx`

Expected: FAIL，缺少表单组件。

- [ ] **Step 3: 实现桌面双栏和手机分步表单**

桌面左栏依次为模式、平台、图片、基础信息、专业字段和权利确认；权利确认明确说明图片将通过短期签名地址发送给当前 AI 服务商分析，用户需要确认拥有素材权利并同意该次处理；右栏为当前输入摘要、剩余额度和“将生成 3 套主图 + 8–12 屏详情页”。手机端使用 `data-step="1|2|3"` 展示“产品 → 市场 → 确认”三步；底部操作条添加 `padding-bottom: env(safe-area-inset-bottom)`。

图片在浏览器生成 object URL 预览，移除时立即 `URL.revokeObjectURL`；上传时逐文件显示进度和失败重试；不得把 base64 持久化进 localStorage。

- [ ] **Step 4: 实现受保护提交和任务轮询**

点击生成时先调用 `requireLogin('#ai-commerce')`。通过后执行 `createProject → uploadAssets → startGeneration`；幂等键在提交开始时生成一次并保存到组件 state，失败重试沿用同一值。每 2 秒读取任务，状态为 `completed|failed|cancelled` 时停止；组件卸载时 `clearInterval`。

- [ ] **Step 5: 接入 hash 路由和导航**

`App.tsx` 新增 lazy 页面：

```tsx
const CommerceStudioPage = lazy(() => import('./commerce/CommerceStudioPage').then((module) => ({ default: module.CommerceStudioPage })))
const commercePage = pageHash === '#ai-commerce'
```

工具页不渲染首页 footer，保留小型音乐按钮但默认收起；FloatingHeader 在桌面与手机首层都显示“AI 电商设计”，当前页使用 `is-current`。

- [ ] **Step 6: 运行测试和构建**

Run: `npm.cmd test -- tests/commerce-form.test.tsx`

Expected: tests PASS。

Run: `npm.cmd run build`

Expected: PASS。

- [ ] **Step 7: 提交任务 6**

```powershell
git add src/commerce/CommerceStudioPage.tsx src/commerce/CommerceProjectForm.tsx src/commerce/commerce.css src/App.tsx src/components/FloatingHeader.tsx src/components/floating-header.css tests/commerce-form.test.tsx
git commit -m "feat: build AI commerce workspace"
```

---

### 任务 7：结构化结果、复制与历史记录

**Files:**
- Create: `src/commerce/CommerceResult.tsx`
- Create: `src/commerce/CommerceHistory.tsx`
- Create: `tests/commerce-result.test.tsx`
- Modify: `src/commerce/CommerceStudioPage.tsx`
- Modify: `src/commerce/commerce.css`

**Interfaces:**
- Consumes: `CommerceResult`、Repository 项目/任务方法。
- Produces: 结果视图、单项/整套复制、打印样式、历史列表、锁定和删除操作。

- [ ] **Step 1: 编写结果展示与复制测试**

```tsx
it('renders all three hero directions and Russian translations', () => {
  render(<CommerceResult result={ozonResult} />)
  expect(screen.getAllByRole('article', { name: /主图方向/ })).toHaveLength(3)
  expect(screen.getByText('中文解释')).toBeInTheDocument()
})

it('copies a prompt without hidden metadata', async () => {
  render(<CommerceResult result={ozonResult} />)
  await userEvent.click(screen.getAllByRole('button', { name: '复制提示词' })[0])
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ozonResult.heroDirections[0].imagePrompt)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- tests/commerce-result.test.tsx`

Expected: FAIL，缺少结果组件。

- [ ] **Step 3: 实现结果信息层级**

顶层顺序固定为：信息可信度 → 用户与动机 → 卖点优先级 → 平台策略 → 三套主图 → 详情分镜 → 尺寸安全区 → 保真规则 → 待确认项。`confirmed`、`inferred`、`needs-confirmation` 分别显示“已确认”“AI 推测”“待确认”，不得只靠颜色区分。

每套主图提供复制提示词、复制负面提示词和“基于此方向重做”；整套复制输出带 Markdown 标题的纯文本，不包含用户 ID、任务 ID、Storage 路径或 signed URL。

- [ ] **Step 4: 实现历史、锁定和资源清理提示**

历史卡片显示产品名、平台、创建时间、任务状态、剩余图片数与“图片将在 YYYY-MM-DD 清理”；已清理项目显示“原始图片已自动清理，文字方案仍可使用”。锁定开关说明“锁定仅避免软上限提前清理，仍按 7 天到期”。删除必须二次确认并在成功后从列表移除。

- [ ] **Step 5: 添加打印与响应式样式并验证**

`@media print` 隐藏导航、音乐、按钮与历史侧栏，结果主体使用白底黑字；390px 下主图方向和详情分镜改为单列，不出现横向滚动。

Run: `npm.cmd test -- tests/commerce-result.test.tsx`

Expected: tests PASS。

Run: `npm.cmd run build`

Expected: PASS。

- [ ] **Step 6: 提交任务 7**

```powershell
git add src/commerce/CommerceResult.tsx src/commerce/CommerceHistory.tsx src/commerce/CommerceStudioPage.tsx src/commerce/commerce.css tests/commerce-result.test.tsx
git commit -m "feat: present and archive commerce results"
```

---

### 任务 8：站长管理后台

**Files:**
- Create: `src/commerce/CommerceAdminPage.tsx`
- Create: `tests/commerce-admin.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/FloatingHeader.tsx`
- Modify: `src/commerce/commerce.css`

**Interfaces:**
- Consumes: `useAuth().isAdmin`、Repository 后台方法、管理员 RPC。
- Produces: `#commerce-admin` 管理员页面、概览/用户/任务/设置四标签、额度 999/无限及禁用控制。

- [ ] **Step 1: 编写权限与额度操作测试**

```tsx
it('does not render admin data for a non-admin session', () => {
  mockAuth({ ready: true, isAdmin: false })
  render(<CommerceAdminPage />)
  expect(screen.getByText('无权访问此页面')).toBeInTheDocument()
  expect(getAdminDashboard).not.toHaveBeenCalled()
})

it('sets a friend to 999 credits with an audit reason', async () => {
  mockAuth({ ready: true, isAdmin: true })
  render(<CommerceAdminPage />)
  await userEvent.click(await screen.findByRole('button', { name: '设置额度' }))
  await userEvent.clear(screen.getByLabelText('剩余次数'))
  await userEvent.type(screen.getByLabelText('剩余次数'), '999')
  await userEvent.type(screen.getByLabelText('调整原因'), '朋友体验账户')
  await userEvent.click(screen.getByRole('button', { name: '确认保存' }))
  expect(setUserEntitlement).toHaveBeenCalledWith(expect.objectContaining({ credits: 999, reason: '朋友体验账户' }))
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- tests/commerce-admin.test.tsx`

Expected: FAIL，缺少后台组件。

- [ ] **Step 3: 实现四标签后台**

概览显示用户数、今日任务、成功率、今日额度消耗、有效 Storage 字节；用户表支持邮箱/UUID 搜索及“设置次数”“无限”“禁用”；任务表显示状态、平台、耗时、模型、错误码、退款时间；设置页只允许通过 `updateAdminSettings(settings, reason)` 更新 `new_user_credits`、`default_daily_limit`、`max_project_images`、`storage_soft_limit_bytes`、`storage_target_bytes`，并验证目标水位小于软上限。

所有写操作必须要求非空原因，保存成功后重新读取服务器数据；普通用户页面不发起后台 RPC。

- [ ] **Step 4: 接入管理员路由与隐藏入口**

`#commerce-admin` 只在 `isAdmin` 为 true 时出现在“我的”下拉菜单；手工输入 hash 的普通用户显示无权限页面，不重定向到首页以便明确解释。

- [ ] **Step 5: 运行测试和构建**

Run: `npm.cmd test -- tests/commerce-admin.test.tsx`

Expected: tests PASS。

Run: `npm.cmd run build`

Expected: PASS。

- [ ] **Step 6: 提交任务 8**

```powershell
git add src/commerce/CommerceAdminPage.tsx src/commerce/commerce.css src/App.tsx src/components/FloatingHeader.tsx tests/commerce-admin.test.tsx
git commit -m "feat: add commerce administrator console"
```

---

### 任务 9：7 天到期与存储软上限自动清理

**Files:**
- Create: `supabase/functions/cleanup-commerce-assets/index.ts`
- Create: `supabase/functions/cleanup-commerce-assets/index.test.ts`
- Create: `.github/workflows/cleanup-commerce-assets.yml`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: header `x-cleanup-secret`、资源表、项目锁定、Storage 设置。
- Produces: `{ deletedAssets, deletedBytes, beforeBytes, afterBytes, reasonCounts }`、`cleanup_runs` 记录。

- [ ] **Step 1: 编写候选排序测试**

```ts
Deno.test('expired assets are deleted before soft-limit candidates', () => {
  const candidates = selectCleanupCandidates(fixtures, { now: NOW, softLimit: 800, target: 650 })
  assertEquals(candidates.map((item) => item.id), ['expired-ready', 'oldest-unlocked'])
})

Deno.test('processing and locked non-expired assets are excluded from early cleanup', () => {
  const candidates = selectCleanupCandidates(fixtures, { now: NOW, softLimit: 800, target: 650 })
  assertFalse(candidates.some((item) => item.id === 'processing'))
  assertFalse(candidates.some((item) => item.id === 'locked-future'))
})
```

- [ ] **Step 2: 实现清理函数**

函数要求 `x-cleanup-secret === Deno.env.get('CLEANUP_SECRET')`；先把超过 15 分钟仍为 `queued|processing` 的 generation 交给 `fail_commerce_generation` 标记失败并幂等退款，再查找所有 `expires_at <= now()` 且非 `processing` 的有效资源，最后计算剩余有效字节；若超过软上限，追加 `state='ready'` 且项目未锁定的资源并按 `created_at asc` 选择到目标水位。Storage 删除成功后才把行改为 `deleted`；单文件失败记录错误但继续批次；最终写 `cleanup_runs`。

- [ ] **Step 3: 配置每日工作流**

```yaml
name: Cleanup private commerce assets
on:
  schedule:
    - cron: '20 19 * * *'
  workflow_dispatch:
jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger cleanup
        run: curl --fail-with-body --retry 2 -X POST "$SUPABASE_CLEANUP_URL" -H "x-cleanup-secret: $SUPABASE_CLEANUP_SECRET"
        env:
          SUPABASE_CLEANUP_URL: ${{ secrets.SUPABASE_CLEANUP_URL }}
          SUPABASE_CLEANUP_SECRET: ${{ secrets.SUPABASE_CLEANUP_SECRET }}
```

19:20 UTC 对应上海次日 03:20；GitHub 仓库 Secrets 中配置 URL 和同一个清理密钥。

- [ ] **Step 4: 测试、部署并手工触发一次**

Run: `deno test supabase/functions/cleanup-commerce-assets/index.test.ts`

Expected: tests PASS。

Run:

```powershell
npx.cmd supabase secrets set "CLEANUP_SECRET=$env:CLEANUP_SECRET"
npx.cmd supabase functions deploy cleanup-commerce-assets --no-verify-jwt
```

部署后用 GitHub Actions `workflow_dispatch` 触发，Expected: HTTP 200，`cleanup_runs` 新增一行，未到期锁定图片不被提前删除。

- [ ] **Step 5: 提交任务 9**

```powershell
git add supabase/functions/cleanup-commerce-assets .github/workflows/cleanup-commerce-assets.yml supabase/README.md
git commit -m "feat: automate private asset retention"
```

---

### 任务 10：首页定位与 AI 电商入口

**Files:**
- Create: `src/components/CommerceHomeSection.tsx`
- Modify: `src/components/StatusScene.tsx`
- Modify: `src/components/StudioMap.tsx`
- Modify: `src/components/ProjectArchive.tsx`
- Modify: `src/content/site.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `#ai-commerce` 路由和四个平台。
- Produces: AI 电商为主线的首页首屏、平台能力、三步流程、示例结果及工具 CTA。

- [ ] **Step 1: 改写首屏内容但保留 Gradient Waves 和 WENHAO 粒子效果**

首屏主标题使用“AI 电商视觉，先把策略想清楚。”；说明使用“面向 Ozon、Wildberries、抖音与淘宝/天猫，根据产品图生成主图创意、详情页分镜和可执行作图提示词。”；主按钮“免费分析一个产品”链接 `#ai-commerce`，次按钮“查看示例方案”链接 `#commerce-examples`。

- [ ] **Step 2: 新增平台能力与三步流程**

`CommerceHomeSection` 展示四个平台卡片和三个步骤：上传产品资料、选择市场平台、获得主图与详情页方案。示例结果明确标记“演示案例”，不得伪装成真实客户数据。

- [ ] **Step 3: 降低音乐和实验内容层级**

保留作品、音乐和留言入口，但首页顺序调整为：首屏 → AI 工具能力 → 示例结果 → 个人案例 → 实验记录；音乐仍只通过右下角小按钮进入，不新增横向播放器。

- [ ] **Step 4: 构建并做静态文案检查**

Run: `npm.cmd run build`

Expected: PASS。

Run:

```powershell
Select-String -Path src/components/*.tsx,src/content/site.ts -Pattern "Ozon|Wildberries|抖音|淘宝/天猫|免费分析一个产品"
```

Expected: 五组关键文案均有匹配。

- [ ] **Step 5: 提交任务 10**

```powershell
git add src/components/CommerceHomeSection.tsx src/components/StatusScene.tsx src/components/StudioMap.tsx src/components/ProjectArchive.tsx src/content/site.ts src/App.tsx src/styles.css
git commit -m "feat: position homepage around AI commerce"
```

---

### 任务 11：全流程验证、部署文档与上线

**Files:**
- Modify: `.env.example`
- Modify: `docs/project-log.md`
- Create: `docs/ai-commerce-operations.md`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: 所有前述任务的页面、函数、迁移与 Secrets。
- Produces: 可复现上线步骤、运行维护手册、桌面/移动验证记录和生产发布。

- [ ] **Step 1: 补齐环境与运维文档**

`.env.example` 只保留公开前端变量：

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

`docs/ai-commerce-operations.md` 写清：数据库迁移、添加站长、部署两个函数、设置 OpenAI/Origin/Cleanup Secrets、GitHub 清理 Secrets、额度调整、查看失败任务、手工退款、查看存储和回滚前端版本。任何密钥值都不得写入文档。

- [ ] **Step 2: 运行完整自动化检查**

Run: `npm.cmd test`

Expected: all Vitest tests PASS。

Run: `npm.cmd run build`

Expected: PASS，`dist` 生成成功。

- [ ] **Step 3: 使用 Playwright 验证桌面端**

在 1440×1000 验证：主页 CTA → 工作台 → 登录门槛 → 快速/专业切换 → 六图上限 → 上传 → 生成中 → 结果 → 历史 → 复制；管理员账号验证 999、无限、禁用、设置保存；浏览器控制台无应用错误。

- [ ] **Step 4: 使用 Playwright 验证 390px 手机端**

验证浮动导航、三步表单、键盘输入、固定底栏、图片预览、任务状态、结果折叠、历史与登录弹层；检查 `document.documentElement.scrollWidth === window.innerWidth`，按钮可点击且音乐按钮不遮挡主操作。

- [ ] **Step 5: 验证真实安全边界**

用普通用户会话直接请求其他用户的 project、asset、generation 和 admin RPC，Expected: 空结果或 403；用匿名会话调用分析，Expected: 401；重复发送同一 idempotency key，Expected: 返回同一个 generation ID 且 `credit_ledger` 只有一条消费；模拟模型失败，Expected: 额度恢复且仅一条退款。

- [ ] **Step 6: 更新过程日志并提交**

`docs/project-log.md` 记录迁移版本、函数版本、测试结果、已配置的平台、7 天清理策略、软上限、上线 commit 与已知限制。

```powershell
git add .env.example docs/project-log.md docs/ai-commerce-operations.md .github/workflows/deploy-pages.yml
git commit -m "docs: finalize AI commerce operations"
```

- [ ] **Step 7: 发布并做生产冒烟验证**

将完成分支推送至 GitHub Pages 发布分支；等待 Actions 成功后，在 `https://geniusli.cn/#ai-commerce` 重跑首页、登录、创建任务、查看结果和管理员额度操作。生产验证失败时停止发布并保留上一可用 Pages 部署。

---

## 自检结论

- 规格 1–14 节均映射到任务：产品定位（10）、平台与输入（1/6）、登录与额度（2/3）、AI 输出（1/5/7）、服务架构（2/4/5）、数据模型（2）、图片清理（2/9）、后台（8）、安全异常（2/4/5/11）、响应式（6/7/11）、首版边界与验收（11）。
- 前端 `CommerceResult`、Edge Function JSON Schema 与数据库 `result_data` 统一使用 `CommerceResult` 字段命名；平台值统一为 `ozon|wildberries|douyin|taobao-tmall`。
- 计划中没有未定义的后续接口；所有跨任务 RPC 和 Repository 方法均在首次生产任务中声明。
- `.deploy-worktree/` 明确排除在每次暂存范围之外。
