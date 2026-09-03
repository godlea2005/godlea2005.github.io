# DeepSeek Switchable Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed, server-only provider router so the AI commerce workflow can analyze real product images with DeepSeek now and switch back to OpenAI later without frontend or database changes.

**Architecture:** Keep the existing `AiProvider` boundary and Responses API result pipeline. Add a small fixed-endpoint router in `_shared/ai-provider.ts`, retain the existing OpenAI adapter, and add a DeepSeek adapter restricted to `deepseek-v4-flash-vision-exp`. The `analyze-commerce` entry selects the provider from Supabase Edge Function Secrets; all charging, validation, retry, completion, and refund behavior remains in `commerce-runtime.ts`.

**Tech Stack:** TypeScript, Deno 2.9, Supabase Edge Functions, DeepSeek Responses API, Vitest 4, native `deno test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-deepseek-provider-routing-design.md`

## Global Constraints

- Provider values are exactly `deepseek` or `openai`; missing or unknown values fail closed and never silently fall back.
- Provider endpoints are constants in source: `https://api.deepseek.com/responses` and `https://api.openai.com/v1/responses`; no environment variable may override them.
- DeepSeek is restricted to `deepseek-v4-flash-vision-exp` until a future code-and-test change expands the allowlist.
- `DEEPSEEK_API_KEY` and `OPENAI_API_KEY` remain Supabase server Secrets and never enter `VITE_` variables, repository files, logs, errors, or GitHub Pages build configuration.
- DeepSeek failures never automatically retry through OpenAI; the existing single invalid-result repair retry may only call the already selected provider.
- `AI_TIMEOUT_MS` has priority, clamps finite positive values to `5000..90000`, defaults to `60000`, and falls back to legacy `OPENAI_TIMEOUT_MS` only when the new setting is absent.
- Existing `CommerceResult`, database schema, quota charging, idempotency, fail/refund, seven-day retention, CORS, and private signed-image behavior do not change.
- The deployment must use the already linked Supabase project and must not print, store, or request the DeepSeek key in chat.

---

### Task 1: Add the DeepSeek Responses adapter and provider router

**Files:**
- Modify: `supabase/functions/_shared/ai-provider.ts`
- Test: `supabase/functions/analyze-commerce/index.test.ts`

**Interfaces:**
- Consumes: existing `AiProvider.generate({ prompt, imageUrls, schema })` and `SafeProviderError`.
- Produces: `createDeepSeekProvider(dependencies?: ProviderDependencies): AiProvider` and `createAiProvider(dependencies?: ProviderDependencies): AiProvider`.
- Preserves: `createOpenAiProvider(dependencies?: ProviderDependencies): AiProvider` for explicit tests and future OpenAI selection.

- [ ] **Step 1: Extend test imports and write a failing DeepSeek request-contract test**

Update the provider import in `supabase/functions/analyze-commerce/index.test.ts`:

```ts
import {
  createAiProvider,
  createDeepSeekProvider,
  createOpenAiProvider,
  SafeProviderError,
} from '../_shared/ai-provider.ts'
```

Add a test that captures URL, Authorization, and JSON body:

```ts
test('DeepSeek provider sends vision input to the fixed Responses endpoint', async () => {
  let requestUrl = ''
  let requestBody: Record<string, unknown> = {}
  let authorization = ''
  const provider = createDeepSeekProvider({
    getEnv: (name) => name === 'DEEPSEEK_API_KEY' ? 'deepseek-test-key' : undefined,
    fetchFn: async (url, init) => {
      requestUrl = String(url)
      requestBody = JSON.parse(String(init?.body))
      authorization = new Headers(init?.headers).get('authorization') ?? ''
      return Response.json({
        output_text: JSON.stringify(sampleResult()),
        model: 'deepseek-v4-flash-vision-exp',
        usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 },
      })
    },
  })

  const output = await provider.generate({
    prompt: 'analyze product image',
    imageUrls: ['https://signed.invalid/product.webp'],
    schema: COMMERCE_RESULT_SCHEMA as unknown as Record<string, unknown>,
  })

  assertEquals(requestUrl, 'https://api.deepseek.com/responses')
  assertEquals(authorization, 'Bearer deepseek-test-key')
  assertEquals(requestBody.model, 'deepseek-v4-flash-vision-exp')
  assertEquals(requestBody.reasoning, { effort: 'none' })
  assert(!Object.hasOwn(requestBody, 'store'))
  const format = (requestBody.text as { format: Record<string, unknown> }).format
  assertEquals(format.type, 'json_schema')
  assertEquals(format.name, 'commerce_result')
  assertEquals(format.schema, COMMERCE_RESULT_SCHEMA)
  assert(!Object.hasOwn(format, 'strict'))
  const input = requestBody.input as Array<{ content: Array<Record<string, unknown>> }>
  assertEquals(input[0].content[1], {
    type: 'input_image',
    image_url: 'https://signed.invalid/product.webp',
  })
  assertEquals(output.usage, { input_tokens: 11, output_tokens: 22, total_tokens: 33 })
})
```

- [ ] **Step 2: Write failing fail-closed routing and model-allowlist tests**

Add table-driven assertions:

```ts
test('provider router selects only the explicitly configured provider', async () => {
  const calls: string[] = []
  const deepseek = createAiProvider({
    getEnv: (name) => ({
      AI_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'deepseek-test-key',
      OPENAI_API_KEY: 'openai-test-key',
    })[name],
    fetchFn: async (url) => {
      calls.push(String(url))
      return Response.json({ output_text: JSON.stringify(sampleResult()) })
    },
  })
  await deepseek.generate({ prompt: 'x', imageUrls: [], schema: {} })
  assertEquals(calls, ['https://api.deepseek.com/responses'])

  for (const value of [undefined, '', 'other']) {
    const provider = createAiProvider({ getEnv: (name) => name === 'AI_PROVIDER' ? value : undefined })
    await assertProviderError(provider, 'PROVIDER_NOT_CONFIGURED')
  }
})

test('DeepSeek provider rejects missing keys and non-vision model configuration', async () => {
  for (const env of [
    { DEEPSEEK_MODEL: 'deepseek-v4-flash-vision-exp' },
    { DEEPSEEK_API_KEY: 'test-key', DEEPSEEK_MODEL: 'deepseek-v4-flash' },
  ]) {
    const provider = createDeepSeekProvider({ getEnv: (name) => env[name as keyof typeof env] })
    await assertProviderError(provider, 'PROVIDER_NOT_CONFIGURED')
  }
})
```

Define the exact local helper above the tests:

```ts
const assertProviderError = async (provider: { generate: AiProvider['generate'] }, code: string) => {
  try {
    await provider.generate({ prompt: 'x', imageUrls: [], schema: {} })
    throw new Error('provider should reject')
  } catch (error) {
    assert(error instanceof SafeProviderError)
    assertEquals(error.code, code)
  }
}
```

Import `type AiProvider` with the provider imports.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
npx.cmd deno test supabase/functions/analyze-commerce/index.test.ts
```

Expected: type/import failure because `createDeepSeekProvider` and `createAiProvider` do not exist.

- [ ] **Step 4: Implement the fixed provider configuration and common Responses request path**

In `supabase/functions/_shared/ai-provider.ts`, retain `outputTextFrom`, `numericUsage`, and safe error mapping. Add exact constants and configuration:

```ts
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEEPSEEK_RESPONSES_URL = 'https://api.deepseek.com/responses'
const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp'
const DEEPSEEK_MODEL_ALLOWLIST = new Set([DEEPSEEK_VISION_MODEL])

type ResponsesProviderConfig = {
  endpoint: typeof OPENAI_RESPONSES_URL | typeof DEEPSEEK_RESPONSES_URL
  apiKeyEnv: 'OPENAI_API_KEY' | 'DEEPSEEK_API_KEY'
  modelEnv: 'OPENAI_MODEL' | 'DEEPSEEK_MODEL'
  defaultModel: string
  allowedModels?: ReadonlySet<string>
  includeStore: boolean
  strictSchema: boolean
  reasoning?: { effort: 'none' }
}
```

Change timeout selection to:

```ts
const providerTimeoutMs = (getEnv: (name: string) => string | undefined) => {
  const raw = getEnv('AI_TIMEOUT_MS')?.trim() || getEnv('OPENAI_TIMEOUT_MS')?.trim()
  const configured = Number(raw)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, configured))
}
```

Create one private `createResponsesProvider(config, dependencies)` implementation. It must read only `config.apiKeyEnv` and `config.modelEnv`, reject a model outside `allowedModels`, build the existing `input` and `text.format`, add `strict: true` only when `strictSchema` is true, add `store: false` only when `includeStore` is true, add DeepSeek `{ reasoning: { effort: 'none' } }`, and reuse the current timeout/error/output parsing logic. DeepSeek's format contains only `type`, `name`, and `schema`; OpenAI preserves its existing `strict: true` contract.

Export the three factories:

```ts
export const createOpenAiProvider = (dependencies: ProviderDependencies = {}): AiProvider =>
  createResponsesProvider({
    endpoint: OPENAI_RESPONSES_URL,
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-5.4-mini',
    includeStore: true,
    strictSchema: true,
  }, dependencies)

export const createDeepSeekProvider = (dependencies: ProviderDependencies = {}): AiProvider =>
  createResponsesProvider({
    endpoint: DEEPSEEK_RESPONSES_URL,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: DEEPSEEK_VISION_MODEL,
    allowedModels: DEEPSEEK_MODEL_ALLOWLIST,
    includeStore: false,
    strictSchema: false,
    reasoning: { effort: 'none' },
  }, dependencies)

export const createAiProvider = (dependencies: ProviderDependencies = {}): AiProvider => {
  const getEnv = dependencies.getEnv ?? denoEnv
  const selected = getEnv('AI_PROVIDER')?.trim().toLowerCase()
  if (selected === 'deepseek') return createDeepSeekProvider({ ...dependencies, getEnv })
  if (selected === 'openai') return createOpenAiProvider({ ...dependencies, getEnv })
  return {
    generate: async () => {
      throw new SafeProviderError('PROVIDER_NOT_CONFIGURED', 'AI 服务尚未配置。')
    },
  }
}
```

Do not read `AI_BASE_URL`, `DEEPSEEK_BASE_URL`, or any other endpoint override.

- [ ] **Step 5: Add timeout precedence and upstream-error privacy tests**

Extend the existing timeout table to cover:

```ts
[
  [{ AI_TIMEOUT_MS: '7000', OPENAI_TIMEOUT_MS: '5000' }, 7000],
  [{ AI_TIMEOUT_MS: '100' }, 5000],
  [{ AI_TIMEOUT_MS: '120000' }, 90000],
  [{ AI_TIMEOUT_MS: 'bad', OPENAI_TIMEOUT_MS: '5000' }, 60000],
  [{ OPENAI_TIMEOUT_MS: '5000' }, 5000],
]
```

Add a DeepSeek 429 response whose body contains `private upstream detail` and assert neither that text nor `deepseek-test-key` appears in the thrown error serialization.

- [ ] **Step 6: Run focused native and Node-compatible tests**

Run:

```powershell
npx.cmd deno test supabase/functions/analyze-commerce/index.test.ts
npm.cmd test -- --exclude=.worktrees/** --exclude=.deploy-worktree/** supabase/functions/analyze-commerce/index.test.ts
```

Expected: both commands pass, including existing OpenAI tests.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- supabase/functions/_shared/ai-provider.ts supabase/functions/analyze-commerce/index.test.ts
git commit -m "feat: add switchable deepseek provider"
```

---

### Task 2: Wire the router into the production Edge entry and lock the deployment contract

**Files:**
- Modify: `supabase/functions/analyze-commerce/index.ts`
- Modify: `supabase/functions/_shared/commerce-runtime.ts`
- Modify: `tests/deployment-contract.test.ts`
- Test: `supabase/functions/analyze-commerce/index.test.ts`

**Interfaces:**
- Consumes: `createAiProvider(dependencies?: ProviderDependencies): AiProvider` from Task 1.
- Produces: production `analyze-commerce` boot path that selects exactly one provider from runtime Secrets.
- Preserves: permission-free module import and `createProductionAnalyzeHandler` dependency injection.

- [ ] **Step 1: Write a failing source/deployment contract test**

Add to `tests/deployment-contract.test.ts`:

```ts
it('keeps AI provider routing server-only and fixed to trusted endpoints', () => {
  const provider = read('supabase/functions/_shared/ai-provider.ts')
  const entry = read('supabase/functions/analyze-commerce/index.ts')
  const workflow = read('.github/workflows/deploy-pages.yml')

  expect(entry).toContain('createAiProvider()')
  expect(entry).not.toContain('createOpenAiProvider()')
  expect(provider).toContain("'https://api.deepseek.com/responses'")
  expect(provider).toContain("'https://api.openai.com/v1/responses'")
  expect(provider).not.toMatch(/(?:AI|DEEPSEEK|OPENAI)_BASE_URL/)
  expect(workflow).not.toMatch(/DEEPSEEK_API_KEY|OPENAI_API_KEY|AI_PROVIDER/)
})
```

Keep the existing `Edge entry can be imported without granting environment permission` test unchanged and include it in every focused run; it must continue to pass after routing is wired.

- [ ] **Step 2: Run the focused deployment contract and verify RED**

Run:

```powershell
npm.cmd test -- --exclude=.worktrees/** --exclude=.deploy-worktree/** tests/deployment-contract.test.ts
```

Expected: FAIL because the production entry still calls `createOpenAiProvider()`.

- [ ] **Step 3: Switch the production entry to the router and remove the stale import**

Change `supabase/functions/analyze-commerce/index.ts`:

```ts
import { createAiProvider } from '../_shared/ai-provider.ts'
// ...
aiProvider: createAiProvider(),
```

Change the first import in `supabase/functions/_shared/commerce-runtime.ts` to:

```ts
import { SafeProviderError, type AiProvider } from './ai-provider.ts'
```

No handler, charging, background task, or refund code changes belong in this task.

- [ ] **Step 4: Run production-entry and contract tests**

Run:

```powershell
npx.cmd deno test supabase/functions/analyze-commerce/index.test.ts
npm.cmd test -- --exclude=.worktrees/** --exclude=.deploy-worktree/** tests/deployment-contract.test.ts
npm.cmd run check:edge
```

Expected: all pass and all three Edge entry points type-check.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- supabase/functions/analyze-commerce/index.ts supabase/functions/_shared/commerce-runtime.ts tests/deployment-contract.test.ts supabase/functions/analyze-commerce/index.test.ts
git commit -m "refactor: route commerce analysis providers"
```

---

### Task 3: Update operational contracts and run the complete local gate

**Files:**
- Modify: `docs/ai-commerce-operations.md`
- Modify: `docs/project-log.md`
- Modify: `tests/deployment-contract.test.ts`

**Interfaces:**
- Consumes: exact Secret names and provider behavior from Tasks 1–2.
- Produces: reproducible DeepSeek configuration, rollback, and verification instructions without secret values.

- [ ] **Step 1: Make deployment documentation expectations fail first**

Extend the existing operations-guide contract in `tests/deployment-contract.test.ts`:

```ts
for (const name of [
  'AI_PROVIDER',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'deepseek-v4-flash-vision-exp',
  'AI_TIMEOUT_MS',
  'https://api.deepseek.com/responses',
]) expect(guide).toContain(name)

expect(guide).toMatch(/AI_PROVIDER=deepseek[\s\S]*DEEPSEEK_API_KEY/)
expect(guide).toMatch(/AI_TIMEOUT_MS[\s\S]*OPENAI_TIMEOUT_MS[\s\S]*兼容/)
expect(guide).toMatch(/不得[\s\S]{0,80}自动回退[\s\S]{0,80}OpenAI/)
expect(guide).toMatch(/DeepSeek[\s\S]*真实图片[\s\S]*额度只扣一次/)
```

Run the focused test and expect failure because the guide still documents only OpenAI.

- [ ] **Step 2: Update the operations guide with exact secret and rollback procedures**

In `docs/ai-commerce-operations.md`, replace the OpenAI-only provider section with:

```markdown
- Provider 路由：`AI_PROVIDER` 必须为 `deepseek` 或 `openai`；缺失/非法时 fail-closed，不自动跨供应商回退。
- DeepSeek：`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL=deepseek-v4-flash-vision-exp`。
- OpenAI：`OPENAI_API_KEY`、`OPENAI_MODEL`。
- 通用超时：优先 `AI_TIMEOUT_MS`；缺失时兼容旧 `OPENAI_TIMEOUT_MS`；默认 60 秒并 clamp 到 5..90 秒。
- 固定 DeepSeek endpoint：`https://api.deepseek.com/responses`；不得配置自定义 Provider URL。
```

Document rollback as changing `AI_PROVIDER=openai` only after `OPENAI_API_KEY` exists and then redeploying `analyze-commerce`; never use automatic fallback for a failed request.

Document the live DeepSeek gate: one signed real image, completed generation, `model=deepseek-v4-flash-vision-exp`, valid `CommerceResult`, one debit, no refund on success, and no signed URL/key in stored result or logs.

- [ ] **Step 3: Append an accurate project-log entry**

Append a dated entry to `docs/project-log.md` only after local verification. Record exact counts from the commands in Step 4, state that the DeepSeek key was never written locally, and keep live DeepSeek generation marked pending until Task 4 succeeds.

- [ ] **Step 4: Run all local gates**

Run:

```powershell
npm.cmd test -- --exclude=.worktrees/** --exclude=.deploy-worktree/**
npm.cmd run check:edge
npx.cmd deno test supabase/functions/analyze-commerce/index.test.ts supabase/functions/commerce-upload/index.test.ts supabase/functions/cleanup-commerce-assets/index.test.ts
npm.cmd run build
git diff --check
```

Expected: all Vitest files pass, 65 or more native Deno tests pass, all three Edge entries check, production build succeeds, and the only accepted build warning is the existing `MusicPage` chunk above 500 kB.

- [ ] **Step 5: Request independent code review and resolve every Critical/Important finding**

Review scope: provider routing, fixed endpoints, DeepSeek request compatibility, key privacy, timeout precedence, no cross-provider fallback, production entry wiring, deployment contract, and documentation truthfulness. Re-run the affected focused tests after every fix; proceed only at 0 Critical and 0 Important.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- docs/ai-commerce-operations.md docs/project-log.md tests/deployment-contract.test.ts
git commit -m "docs: add deepseek provider operations"
```

---

### Task 4: Configure Supabase, deploy, and execute controlled live smoke

**Files:**
- No secret-bearing repository files.
- Modify after successful verification: `docs/project-log.md`

**Interfaces:**
- Consumes: linked project `ujwwwqlpwdplulzslgpi`, deployed database migrations, `analyze-commerce`, `commerce-upload`, existing OAuth, and the server-only DeepSeek adapter.
- Produces: active DeepSeek configuration and evidence that one real authenticated image analysis completes safely.

- [ ] **Step 1: Have the user save the DeepSeek key directly in Supabase**

In Supabase Dashboard → Edge Functions → Secrets, the user creates `DEEPSEEK_API_KEY`. The value is never pasted into chat, shell history, `.env.local`, a plan, or GitHub.

Verify only the name appears:

```powershell
npx.cmd supabase secrets list
```

Expected names include `ALLOWED_ORIGINS`, `CLEANUP_SECRET`, and `DEEPSEEK_API_KEY`; output must not expose secret plaintext.

- [ ] **Step 2: Set non-secret provider configuration**

Run:

```powershell
npx.cmd supabase secrets set AI_PROVIDER=deepseek DEEPSEEK_MODEL=deepseek-v4-flash-vision-exp AI_TIMEOUT_MS=60000
```

Then list Secret names and confirm all three configuration names exist. Do not add any of them to GitHub Pages variables.

- [ ] **Step 3: Deploy only the changed analysis function and verify its remote version**

Run:

```powershell
npx.cmd supabase functions deploy analyze-commerce --no-verify-jwt
npx.cmd supabase functions list
```

Expected: `analyze-commerce` status is active and its update timestamp/version changes; `commerce-upload` and `cleanup-commerce-assets` remain active.

- [ ] **Step 4: Run unauthenticated CORS and authorization smoke tests**

Run against `https://ujwwwqlpwdplulzslgpi.supabase.co/functions/v1`:

```powershell
curl.exe --silent --show-error --dump-header - --output NUL --request OPTIONS --header "Origin: https://geniusli.cn" --header "Access-Control-Request-Method: POST" "https://ujwwwqlpwdplulzslgpi.supabase.co/functions/v1/analyze-commerce"
curl.exe --silent --show-error --write-out "HTTP_STATUS:%{http_code}`n" --request POST --header "Origin: https://geniusli.cn" --header "Content-Type: application/json" --data '{}' "https://ujwwwqlpwdplulzslgpi.supabase.co/functions/v1/analyze-commerce"
curl.exe --silent --show-error --write-out "HTTP_STATUS:%{http_code}`n" --request OPTIONS --header "Origin: https://evil.invalid" "https://ujwwwqlpwdplulzslgpi.supabase.co/functions/v1/analyze-commerce"
```

Expected: allowed preflight `204` with the exact reflected origin, anonymous POST `401`, and disallowed origin `403`. No generation or charge is created.

- [ ] **Step 5: Publish the tested commit and wait for Pages**

Before push, set the already public build values without printing `.env.local` values:

```powershell
gh variable set VITE_SUPABASE_URL --repo godlea2005/godlea2005.github.io --body "https://ujwwwqlpwdplulzslgpi.supabase.co"
```

Read `VITE_SUPABASE_PUBLISHABLE_KEY` from the existing ignored `.env.local` inside the process and pass it directly to `gh variable set`; never print it. Fetch `origin/main`, require `git merge-base --is-ancestor origin/main HEAD` to succeed, and then use the non-force fast-forward command `git push origin HEAD:main`. If the ancestry check fails, stop for review rather than force-pushing. Use `gh run list`/`gh run watch` until the deploy workflow succeeds.

- [ ] **Step 6: Execute one authenticated real-image browser flow**

Use Playwright against `https://geniusli.cn/#ai-commerce` at desktop and 390 px mobile widths:

1. Sign in with the existing GitHub or Google OAuth account.
2. Confirm the account is recognized as site admin.
3. Create a quick Ozon project with a neutral test product name and one real JPEG/PNG/WebP image under 8 MiB.
4. Start one generation and wait for `completed` or the safe failure UI.
5. On success, assert three hero directions, 8–12 detail frames, Russian on-image copy with Chinese explanations, and a model label containing `deepseek-v4-flash-vision-exp` if the UI exposes it.
6. Confirm no console error, no horizontal overflow, no leaked signed URL, and no raw Provider error.

- [ ] **Step 7: Verify database accounting and privacy through admin-visible APIs/UI**

Confirm the generation appears once, credit decreases by exactly one, no `generation_refund` exists on success, and the stored result contains no `supabase.co/storage/v1/object/sign`, `DEEPSEEK_API_KEY`, or bearer value. If the Provider fails, confirm status becomes `failed`, exactly one refund is recorded, and retry with the same idempotency key does not charge again.

- [ ] **Step 8: Record live evidence and commit the deployment log**

Update `docs/project-log.md` with the deployed function version/time, Pages workflow result, exact smoke statuses, generation outcome, model name, and accounting result. Do not record IDs tied to users, signed URLs, request bodies, or secret digests.

```powershell
git add -- .gitignore docs/project-log.md
git commit -m "docs: record deepseek live verification"
git push origin codex/publish-site-20260813
```

If any live gate fails, do not claim completion and do not broaden CORS, disable authorization, expose keys, bypass RLS, or manually alter credits to make the smoke pass.
