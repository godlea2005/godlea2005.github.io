# AI Commerce Workbench UI and Reliability Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AI commerce workspace into a calm, responsive two-column workflow while fixing authenticated Edge Function uploads, contradictory run states, stale history projects, and music-dock click interception.

**Architecture:** A single `CommerceRunState` reducer and `useCommerceRun` orchestration hook become the source of truth for submission UI. Repository calls use an explicit, refreshable authenticated session for Edge Functions; the page composes a focused editor, compact run panel, and overlay history drawer instead of the current permanent three-column layout.

**Tech Stack:** React 19, TypeScript, Vite, Supabase JS 2.112.3, Vitest, Testing Library, plain modular CSS, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-09-04-commerce-workbench-ui-rebuild-design.md`

## Global Constraints

- Keep the site dark-first with a complete light mode; use neutral surfaces and reserve the green accent for the current step, executable CTA, success, and small signals.
- Desktop workspace max width is `1280px`; verify at `1440×1000`, `1024×900`, and `390×844`.
- Keep the three user steps exactly `产品 → 市场 → 确认`.
- At any run phase, render at most one primary action.
- Preserve the existing `CommerceResult` schema, DeepSeek provider routing, credit/refund rules, seven-day asset retention, and administrator entitlement behavior.
- Never persist image bytes/base64 in browser storage. Text draft persistence may use `sessionStorage`; a full OAuth redirect requires the user to reselect files.
- Never log, render, snapshot, or commit access tokens, refresh tokens, OAuth secrets, provider keys, or signed upload URLs.
- Keep all interactive targets at least `44×44px`, retain keyboard operation, and honor `prefers-reduced-motion`.
- Use TDD for every behavior change and make one focused commit after each task passes its named tests.

---

## File Structure

### New files

- `src/commerce/commerceErrors.ts` — commerce error codes, normalization, and user-safe messages.
- `src/commerce/commerceSession.ts` — fresh-session acquisition and authenticated Edge Function invocation.
- `src/commerce/commerceRunMachine.ts` — pure run-state types, reducer, and derived view state.
- `src/commerce/useCommerceRun.ts` — create/upload/start/poll/retry orchestration with stale-user guards.
- `src/commerce/CommerceStudioHeader.tsx` — compact page title, credit indicator, account identity, and history trigger.
- `src/commerce/CommerceStepRail.tsx` — accessible three-step navigation.
- `src/commerce/CommerceRunPanel.tsx` — context summary, status surface, and the one valid primary action.
- `src/commerce/CommerceHistoryDrawer.tsx` — overlay history browser with filters, focus management, lock, open, and delete actions.
- `src/commerce/styles/tokens.css` — dark/light workbench tokens.
- `src/commerce/styles/studio-layout.css` — page shell, header, editor/summary grid, and breakpoints.
- `src/commerce/styles/form.css` — step rail, fields, upload previews, consent, and mode control.
- `src/commerce/styles/status.css` — run panel, progress, error, and primary-action states.
- `src/commerce/styles/history.css` — history backdrop, drawer, filters, cards, and mobile sheet.
- `tests/commerce-errors.test.ts` — error taxonomy tests.
- `tests/commerce-session.test.ts` — session refresh and authenticated function-call tests.
- `tests/commerce-run-machine.test.ts` — pure transition and derived-action tests.
- `tests/commerce-history-drawer.test.tsx` — drawer semantics, filters, focus, and history mutation tests.

### Modified files

- `src/commerce/commerceRepository.ts` — consume session helper, re-export compatibility error API, and explicitly authenticate function calls.
- `src/commerce/CommerceStudioPage.tsx` — replace inline workflow state with the orchestration hook and compose the new shell.
- `src/commerce/CommerceProjectForm.tsx` — become a controlled three-step editor and stop rendering submission status.
- `src/commerce/commerce.css` — import the new style modules and retain only result/admin compatibility rules.
- `src/App.tsx` — expose a commerce-page shell class to coordinate global navigation and the dock.
- `src/components/floating-header.css` — reduce chrome emphasis on the workspace route.
- `src/music/GlobalMusicDock.tsx` — expose deterministic commerce-mode hit areas.
- `src/music/music-experience.css` — pointer-event and compact-placement fix.
- `tests/commerce-form.test.tsx` — update form/workflow coverage for the new components and hook.
- `tests/commerce-repository.test.ts` — add explicit session header and retry assertions.
- `tests/homepage-content.test.tsx` — retain app-route and music-dock contract checks.
- `docs/project-log.md` — record the redesign, fixed failure chain, verification results, and deployment commit.

### Removed file

- `src/commerce/CommerceHistory.tsx` — replaced by `CommerceHistoryDrawer.tsx` after all imports and tests move.

---

### Task 1: Separate Commerce Error Taxonomy From the Repository

**Files:**
- Create: `src/commerce/commerceErrors.ts`
- Create: `tests/commerce-errors.test.ts`
- Modify: `src/commerce/commerceRepository.ts:32-136`
- Modify: `tests/commerce-repository.test.ts`

**Interfaces:**
- Consumes: Supabase/PostgREST/function error objects and optional decoded response `{ code, message, status }`.
- Produces: `CommerceErrorCode`, `CommerceRepositoryError`, `mapCommerceError(error)`, `mapFunctionInvokeError(error)` and `isCommerceAuthError(error)`.

- [ ] **Step 1: Write failing taxonomy tests**

```ts
import { describe, expect, it } from 'vitest'
import { CommerceRepositoryError, mapCommerceError } from '../src/commerce/commerceErrors'

describe('commerce error taxonomy', () => {
  it('does not describe an origin rejection as an expired login', () => {
    const error = mapCommerceError({ status: 403, code: 'ORIGIN_FORBIDDEN', message: 'origin rejected' })
    expect(error).toMatchObject({ code: 'ORIGIN_FORBIDDEN' })
    expect(error.message).toContain('站点来源配置')
    expect(error.message).not.toContain('登录已失效')
  })

  it('maps a real 401 to an actionable authentication error', () => {
    expect(mapCommerceError({ status: 401, code: 'AUTH_REQUIRED' })).toMatchObject({
      code: 'AUTH_REQUIRED',
      message: '登录状态需要恢复，请重新连接账号后继续。',
    })
  })

  it('preserves known backend codes before considering the HTTP status', () => {
    expect(mapCommerceError({ status: 403, code: 'UPLOAD_INVALID' })).toMatchObject({
      code: 'UPLOAD_INVALID',
    })
  })

  it('keeps the original error as a non-rendered cause', () => {
    const source = { status: 429, code: 'RATE_LIMITED' }
    expect(new CommerceRepositoryError('RATE_LIMITED', '请求过于频繁。', source).cause).toBe(source)
  })
})
```

- [ ] **Step 2: Run the taxonomy test and verify it fails**

Run: `npm.cmd test -- tests/commerce-errors.test.ts`

Expected: FAIL because `src/commerce/commerceErrors.ts` does not exist.

- [ ] **Step 3: Implement code-first normalization**

Create these exact public types and mappings:

```ts
export type CommerceErrorCode =
  | 'AUTH_REQUIRED'
  | 'ORIGIN_FORBIDDEN'
  | 'CREDITS_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'ASSETS_EXPIRED'
  | 'UPLOAD_INVALID'
  | 'UPLOAD_RETRY_REQUIRED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVICE_ERROR'

export class CommerceRepositoryError extends Error {
  readonly name = 'CommerceRepositoryError'
  constructor(
    readonly code: CommerceErrorCode,
    message: string,
    readonly cause?: unknown,
  ) { super(message) }
}

export const isCommerceAuthError = (error: unknown) =>
  error instanceof CommerceRepositoryError && error.code === 'AUTH_REQUIRED'
```

Implement `mapCommerceError` with this precedence:

1. Existing `CommerceRepositoryError`.
2. Exact backend code (`AUTH_REQUIRED`, `ORIGIN_FORBIDDEN`, `UPLOAD_INVALID`, `UPLOAD_RETRY_REQUIRED`, credit, rate and expiry codes).
3. PostgreSQL codes (`28000`, `42501`, `55000`, `22023`, `P0002`).
4. HTTP `401` as authentication; bare `403` as service permission/configuration, never automatically as authentication.
5. transport failures as `NETWORK`; unmatched server failures as `SERVICE_ERROR`.

Move response-body decoding and `mapFunctionInvokeError` from `commerceRepository.ts` into this file. Re-export the moved names from `commerceRepository.ts` so existing imports do not break.

- [ ] **Step 4: Run focused error and repository tests**

Run: `npm.cmd test -- tests/commerce-errors.test.ts tests/commerce-repository.test.ts`

Expected: PASS; existing error-copy assertions are updated only where the new accurate taxonomy intentionally differs.

- [ ] **Step 5: Commit the error boundary**

```powershell
git add src/commerce/commerceErrors.ts src/commerce/commerceRepository.ts tests/commerce-errors.test.ts tests/commerce-repository.test.ts
git commit -m "fix: distinguish commerce authentication failures"
```

---

### Task 2: Guarantee an Authenticated Session for Edge Function Calls

**Files:**
- Create: `src/commerce/commerceSession.ts`
- Create: `tests/commerce-session.test.ts`
- Modify: `src/commerce/commerceRepository.ts:382-547`
- Modify: `tests/commerce-repository.test.ts`

**Interfaces:**
- Consumes: a Supabase client with `auth.getSession`, `auth.refreshSession`, `auth.getUser`, and `functions.invoke`.
- Produces:
  - `getFreshAuthenticatedSession(client, options?): Promise<{ userId: string; accessToken: string }>`
  - `invokeAuthenticatedFunction(client, name, body): Promise<unknown>`
  - one authentication retry maximum per function invocation.

- [ ] **Step 1: Write failing session tests**

```ts
it('returns a validated non-anonymous session without refreshing a healthy token', async () => {
  const client = makeSessionClient({ expiresAt: Math.floor(Date.now() / 1000) + 3600 })
  await expect(getFreshAuthenticatedSession(client)).resolves.toEqual({
    userId: 'user-1',
    accessToken: 'current-token',
  })
  expect(client.auth.refreshSession).not.toHaveBeenCalled()
})

it('refreshes a token expiring within sixty seconds before returning it', async () => {
  const client = makeSessionClient({
    expiresAt: Math.floor(Date.now() / 1000) + 20,
    refreshedToken: 'fresh-token',
  })
  await expect(getFreshAuthenticatedSession(client)).resolves.toMatchObject({ accessToken: 'fresh-token' })
  expect(client.auth.refreshSession).toHaveBeenCalledTimes(1)
})

it('rejects missing and anonymous sessions with AUTH_REQUIRED', async () => {
  await expect(getFreshAuthenticatedSession(makeSessionClient({ session: null })))
    .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  await expect(getFreshAuthenticatedSession(makeSessionClient({ anonymous: true })))
    .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
})

it('sends the user JWT explicitly and retries one 401 after refresh', async () => {
  const client = makeSessionClient({ firstInvokeStatus: 401, refreshedToken: 'fresh-token' })
  await invokeAuthenticatedFunction(client, 'commerce-upload', { action: 'reserve' })
  expect(client.functions.invoke).toHaveBeenNthCalledWith(1, 'commerce-upload', expect.objectContaining({
    headers: { Authorization: 'Bearer current-token' },
  }))
  expect(client.functions.invoke).toHaveBeenNthCalledWith(2, 'commerce-upload', expect.objectContaining({
    headers: { Authorization: 'Bearer fresh-token' },
  }))
  expect(client.auth.refreshSession).toHaveBeenCalledTimes(1)
})
```

The fake client stores token strings in memory only. Tests must not print either value.

- [ ] **Step 2: Run session tests and verify failure**

Run: `npm.cmd test -- tests/commerce-session.test.ts`

Expected: FAIL because the session helper is missing.

- [ ] **Step 3: Implement the session helper**

Use this contract:

```ts
export type AuthenticatedCommerceSession = {
  userId: string
  accessToken: string
}

export async function getFreshAuthenticatedSession(
  client: CommerceSessionClient,
  options: { forceRefresh?: boolean; now?: () => number } = {},
): Promise<AuthenticatedCommerceSession>
```

Implementation rules:

- Call `getSession()` first; treat a missing session as `AUTH_REQUIRED`.
- Refresh when `forceRefresh === true` or `expires_at * 1000 - now() <= 60_000`.
- Validate with `getUser(accessToken)` and reject anonymous users.
- Return only `userId` and `accessToken`; never retain refresh tokens.
- Map refresh/network errors through `mapCommerceError`.

Implement `invokeAuthenticatedFunction` so it:

1. obtains a session;
2. calls `functions.invoke(name, { body, headers: { Authorization: ... } })`;
3. decodes the function error;
4. retries exactly once with `forceRefresh: true` only for `AUTH_REQUIRED`;
5. returns parsed data or throws the mapped error.

- [ ] **Step 4: Route upload and generation functions through the helper**

Replace direct calls in `reserveUpload`, `finalizeUpload`, and `startGeneration`. Keep database RPCs behind `requireAuthenticatedUser`; implement it by calling `getFreshAuthenticatedSession` and returning `userId` so every write uses the same session semantics.

Do not retry project creation, Storage upload, credit mutation, or non-auth errors automatically.

- [ ] **Step 5: Run session, repository, and auth tests**

Run: `npm.cmd test -- tests/commerce-session.test.ts tests/commerce-repository.test.ts tests/auth-provider.test.tsx`

Expected: PASS, with exactly one refresh/retry in the 401 case.

- [ ] **Step 6: Commit authenticated function invocation**

```powershell
git add src/commerce/commerceSession.ts src/commerce/commerceRepository.ts tests/commerce-session.test.ts tests/commerce-repository.test.ts
git commit -m "fix: authenticate commerce edge requests"
```

---

### Task 3: Replace Independent Flags With One Run State Machine

**Files:**
- Create: `src/commerce/commerceRunMachine.ts`
- Create: `src/commerce/useCommerceRun.ts`
- Create: `tests/commerce-run-machine.test.ts`
- Modify: `src/commerce/CommerceStudioPage.tsx:9-352`
- Modify: `tests/commerce-form.test.tsx:207-513`

**Interfaces:**
- Consumes: `CommerceRepository`, authenticated user ID, form input, poll interval, and idempotency-key factory.
- Produces:
  - `CommerceRunPhase`
  - `CommerceRunState`
  - `commerceRunReducer(state, event)`
  - `deriveRunPresentation(state, formValidity)`
  - `useCommerceRun(options)` returning `state`, `busy`, `submit`, `retry`, `resetForMaterialChange`, `selectHistoryResult`, and `rerunDirection`.

- [ ] **Step 1: Write failing reducer tests**

```ts
it('replaces the normal submit action with retry after a recoverable failure', () => {
  const failed = commerceRunReducer(initialCommerceRunState, {
    type: 'failed',
    error: new CommerceRepositoryError('NETWORK', '网络暂时不可用。'),
    recovery: 'retry',
  })
  expect(deriveRunPresentation(failed, true)).toMatchObject({
    primaryAction: 'retry',
    showReadyCopy: false,
    showSubmit: false,
  })
})

it('shows account recovery as the only action for AUTH_REQUIRED', () => {
  const state = commerceRunReducer(initialCommerceRunState, {
    type: 'failed',
    error: new CommerceRepositoryError('AUTH_REQUIRED', '登录状态需要恢复。'),
    recovery: 'reauthenticate',
  })
  expect(deriveRunPresentation(state, true).primaryAction).toBe('reauthenticate')
})

it.each([
  ['validating-session', '正在确认登录状态'],
  ['creating-project', '正在建立项目'],
  ['uploading', '正在上传图片'],
  ['starting-generation', '正在启动分析'],
  ['generating', 'AI 正在生成方案'],
])('maps %s to one non-clickable progress action', (phase, label) => {
  expect(deriveRunPresentation({ ...initialCommerceRunState, phase }, true))
    .toMatchObject({ primaryAction: 'progress', primaryLabel: label })
})
```

- [ ] **Step 2: Run reducer tests and verify failure**

Run: `npm.cmd test -- tests/commerce-run-machine.test.ts`

Expected: FAIL because the reducer module does not exist.

- [ ] **Step 3: Implement the pure state machine**

```ts
export type CommerceRunPhase =
  | 'editing'
  | 'validating-session'
  | 'creating-project'
  | 'uploading'
  | 'starting-generation'
  | 'generating'
  | 'recoverable-error'
  | 'auth-recovery'
  | 'terminal-error'
  | 'completed'

export type CommerceRunState = {
  phase: CommerceRunPhase
  progress: AssetUploadProgress | null
  error: CommerceRepositoryError | null
  result: CommerceResult | null
  resultNotice: string
  resultUnavailable: string
  generation: CommerceGeneration | null
}
```

Define reducer events for `begin`, `project-created`, `upload-progress`, `upload-complete`, `generation-started`, `generation-update`, `failed`, `completed`, `reset`, and `history-result-selected`. Illegal transitions return the current state in production and throw in a test-only assertion helper; the UI never derives actions directly from `error` or `validation` alone.

- [ ] **Step 4: Write failing orchestration tests in the existing workflow suite**

Add tests that assert:

```ts
expect(screen.getByRole('button', { name: '重试本次生成' })).toBeVisible()
expect(screen.queryByRole('button', { name: '生成视觉方案' })).not.toBeInTheDocument()
expect(screen.queryByText('资料与授权已齐，可以提交分析。')).not.toBeInTheDocument()
expect(repository.deleteProject).toHaveBeenCalledWith('failed-project')
await waitFor(() => expect(repository.listProjects).toHaveBeenCalledTimes(2))
```

Also preserve the existing stale-user, unmount, poll-stop, idempotency, partial-cleanup, and refund assertions.

- [ ] **Step 5: Extract `useCommerceRun` and wire the page to it**

Move submission refs, stale-user guards, polling, result selection, and rerun-direction preparation out of `CommerceStudioPage`. The hook must:

- dispatch `validating-session` before the first repository mutation;
- maintain one attempt object with signature, project ID, uploaded flag, generation ID, and idempotency key;
- dispatch exact phases around each awaited call;
- after upload failure and successful `deleteProject`, clear the project ID and increment `historyRefreshKey` before entering `recoverable-error`;
- enter `auth-recovery` for `AUTH_REQUIRED` and never show a normal submit action in that phase;
- keep the current stale-user and generation-sequence guards;
- expose a `recoverAuthentication()` callback that calls `auth.requireLogin('#ai-commerce')` only after silent repository recovery has failed.

- [ ] **Step 6: Run state and workflow tests**

Run: `npm.cmd test -- tests/commerce-run-machine.test.ts tests/commerce-form.test.tsx`

Expected: PASS; the failed screenshot state cannot be represented by `deriveRunPresentation`.

- [ ] **Step 7: Commit the run-state boundary**

```powershell
git add src/commerce/commerceRunMachine.ts src/commerce/useCommerceRun.ts src/commerce/CommerceStudioPage.tsx tests/commerce-run-machine.test.ts tests/commerce-form.test.tsx
git commit -m "refactor: unify commerce run state"
```

---

### Task 4: Build the Focused Three-Step Editor and Single Run Panel

**Files:**
- Create: `src/commerce/CommerceStepRail.tsx`
- Create: `src/commerce/CommerceRunPanel.tsx`
- Modify: `src/commerce/CommerceProjectForm.tsx`
- Modify: `src/commerce/CommerceStudioPage.tsx`
- Modify: `tests/commerce-form.test.tsx`

**Interfaces:**
- Consumes: controlled `currentStep`, form input/validity, `CommerceRunState`, credits label, and run callbacks.
- Produces: a controlled editor and exactly one primary action chosen by `deriveRunPresentation`.

- [ ] **Step 1: Update component tests for the new editor contract**

```tsx
it('presents product, market and confirmation as one controlled sequence', async () => {
  render(<CommerceProjectForm {...validProps} />)
  expect(screen.getByRole('button', { name: '产品' })).toHaveAttribute('aria-current', 'step')
  expect(screen.getByRole('heading', { name: '先把产品说明白' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: '市场' }))
  expect(screen.getByRole('heading', { name: '选择销售市场' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: '先把产品说明白' })).not.toBeVisible()
})

it('renders only retry in a recoverable failure', () => {
  render(<CommerceRunPanel {...failedRunPanelProps} />)
  expect(screen.getByRole('button', { name: '重试本次生成' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '生成视觉方案' })).not.toBeInTheDocument()
})

it('summarizes output without a multiline billboard headline', () => {
  render(<CommerceRunPanel {...readyRunPanelProps} />)
  expect(screen.getByText('3 套主图方向 · 8–12 屏详情分镜 · 中俄提示词')).toBeVisible()
  expect(screen.queryByText(/将生成 3 套主图/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused component tests and verify failure**

Run: `npm.cmd test -- tests/commerce-form.test.tsx`

Expected: FAIL because the new components and copy are missing.

- [ ] **Step 3: Implement `CommerceStepRail`**

The public API is:

```ts
type CommerceStep = 1 | 2 | 3

type CommerceStepRailProps = {
  current: CommerceStep
  completed: ReadonlySet<CommerceStep>
  disabled?: boolean
  onChange(step: CommerceStep): void
}
```

Render three buttons named `产品`, `市场`, and `确认`. Set `aria-current="step"` only on the current button, include visible completed marks, and never disable navigation back to a completed step unless a run is busy.

- [ ] **Step 4: Refactor `CommerceProjectForm` into a controlled editor**

Keep object URL creation/revocation, duplicate detection, six-image validation, quick/professional value preservation, and consent behavior. Remove the current summary/status/submit `<aside>`. Expose this data upward:

```ts
export type CommerceFormSnapshot = {
  input: CommerceProjectInput
  validation: ReturnType<typeof validateProjectInput>
  consented: boolean
  missingRequirements: string[]
  selectedPlatformLabel: string
}
```

Call `onSnapshotChange(snapshot)` after values, previews, or consent change. Use these headings:

- Step 1: `先把产品说明白`
- Step 2: `选择销售市场`
- Step 3: `确认后开始分析`

Quick mode shows name, files, optional category, optional selling points, platform, and optional notes. Professional mode additionally shows the existing detailed fields without clearing them when hidden.

- [ ] **Step 5: Implement `CommerceRunPanel`**

```ts
export type CommerceRunPanelProps = {
  snapshot: CommerceFormSnapshot
  runState: CommerceRunState
  creditsLabel: string
  onSubmit(): void
  onRetry(): void
  onRecoverAuthentication(): void
  onStartOver(): void
  onOpenResult(): void
}
```

Render platform, mode, selected-image count, credits, compact output contract, and one `role="status"` surface. Switch over `deriveRunPresentation(...).primaryAction`; do not render multiple action branches together. Make the active CTA a normal-width button inside an action row, not a full-width billboard.

- [ ] **Step 6: Compose editor and run panel in `CommerceStudioPage`**

Maintain the latest `CommerceFormSnapshot` in the page. Submit through `run.submit(snapshot.input)` only when validation and consent are complete. Material changes call `run.resetForMaterialChange()`.

- [ ] **Step 7: Run form and workflow tests**

Run: `npm.cmd test -- tests/commerce-form.test.tsx tests/commerce-run-machine.test.ts`

Expected: PASS, including six-file, object URL, idempotency, error replacement, and mobile-step semantics.

- [ ] **Step 8: Commit the editor rebuild**

```powershell
git add src/commerce/CommerceStepRail.tsx src/commerce/CommerceRunPanel.tsx src/commerce/CommerceProjectForm.tsx src/commerce/CommerceStudioPage.tsx tests/commerce-form.test.tsx
git commit -m "feat: rebuild commerce brief workflow"
```

---

### Task 5: Replace the Permanent History Column With an Accessible Drawer

**Files:**
- Create: `src/commerce/CommerceHistoryDrawer.tsx`
- Create: `tests/commerce-history-drawer.test.tsx`
- Modify: `src/commerce/CommerceStudioPage.tsx`
- Modify: `tests/commerce-form.test.tsx`
- Remove: `src/commerce/CommerceHistory.tsx`

**Interfaces:**
- Consumes: repository, `open`, `refreshKey`, live generation, and result-selection callback.
- Produces: `onClose`, `onCountChange(count)`, filtering, focus restoration, and immediate local removal after deletion.

- [ ] **Step 1: Write failing drawer tests**

```tsx
it('is absent from layout while closed and becomes a modal drawer when opened', async () => {
  const { rerender } = render(<CommerceHistoryDrawer {...props} open={false} />)
  expect(screen.queryByRole('dialog', { name: '历史项目' })).not.toBeInTheDocument()
  rerender(<CommerceHistoryDrawer {...props} open />)
  expect(await screen.findByRole('dialog', { name: '历史项目' })).toHaveAttribute('aria-modal', 'true')
})

it('labels projects without a generation as unfinished drafts', async () => {
  render(<CommerceHistoryDrawer {...props} open />)
  expect(await screen.findByText('未完成草稿')).toBeVisible()
  expect(screen.queryByText('尚无任务')).not.toBeInTheDocument()
})

it('filters completed, processing and unfinished projects', async () => {
  render(<CommerceHistoryDrawer {...props} open />)
  await userEvent.click(await screen.findByRole('button', { name: '未完成' }))
  expect(screen.getByText('未完成草稿')).toBeVisible()
  expect(screen.queryByText('已完成')).not.toBeInTheDocument()
})

it('closes on Escape and restores focus to the history trigger', async () => {
  render(<HistoryHarness />)
  await userEvent.click(screen.getByRole('button', { name: /历史项目/ }))
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '历史项目' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /历史项目/ })).toHaveFocus()
})
```

- [ ] **Step 2: Run drawer tests and verify failure**

Run: `npm.cmd test -- tests/commerce-history-drawer.test.tsx`

Expected: FAIL because `CommerceHistoryDrawer` does not exist.

- [ ] **Step 3: Implement the drawer and move existing history behavior**

Public API:

```ts
export type CommerceHistoryDrawerProps = {
  open: boolean
  repository: CommerceRepository
  refreshKey: number
  liveGeneration: CommerceGeneration | null
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onClose(): void
  onCountChange(count: number): void
  onSelectResult(result: CommerceResult, project: CommerceProject, generation: CommerceGeneration): void
}
```

Render nothing when closed. When opened, load projects/generations, focus the drawer heading, lock background scrolling, close on backdrop or Escape, and restore trigger focus. Implement filter values `all | completed | active | unfinished`; the initial value is `all`.

Move the existing lock, delete confirmation, active-generation guard, expiry copy, image-count copy, and result validation unchanged. Rename no-generation copy to `未完成草稿`. Call `onCountChange(projects.length)` after load or local deletion.

- [ ] **Step 4: Wire local and server refresh after automatic cleanup**

When `useCommerceRun` reports successful deletion of a failed temporary project, increment `historyRefreshKey` and pass `excludedProjectIds` until the next authoritative history load completes. This prevents a slow previous request from re-inserting a ghost card.

- [ ] **Step 5: Remove the old permanent component and run tests**

Delete `src/commerce/CommerceHistory.tsx` only after imports point to the drawer.

Run: `npm.cmd test -- tests/commerce-history-drawer.test.tsx tests/commerce-form.test.tsx tests/commerce-result.test.tsx`

Expected: PASS; closed history occupies no layout width and result selection still works.

- [ ] **Step 6: Commit the history interaction**

```powershell
git add src/commerce/CommerceHistoryDrawer.tsx src/commerce/CommerceStudioPage.tsx tests/commerce-history-drawer.test.tsx tests/commerce-form.test.tsx
git rm src/commerce/CommerceHistory.tsx
git commit -m "feat: move commerce history into drawer"
```

---

### Task 6: Apply the Calm Visual System and Responsive Layout

**Files:**
- Create: `src/commerce/CommerceStudioHeader.tsx`
- Create: `src/commerce/styles/tokens.css`
- Create: `src/commerce/styles/studio-layout.css`
- Create: `src/commerce/styles/form.css`
- Create: `src/commerce/styles/status.css`
- Create: `src/commerce/styles/history.css`
- Modify: `src/commerce/commerce.css`
- Modify: `src/commerce/CommerceStudioPage.tsx`
- Modify: `src/App.tsx:45-73`
- Modify: `src/components/floating-header.css`
- Modify: `tests/commerce-form.test.tsx`
- Modify: `tests/homepage-content.test.tsx`

**Interfaces:**
- Consumes: page auth identity, credits label, history count/open callback, form snapshot, and run state.
- Produces: a `1280px` desktop shell, responsive single-column/tablet/mobile layouts, and shared dark/light workbench tokens.

- [ ] **Step 1: Add failing shell and header tests**

```tsx
it('renders a compact workspace header with credits and history', () => {
  render(<CommerceStudioPage repository={makeRepository()} />)
  expect(screen.getByRole('heading', { name: 'AI 电商视觉工作台' })).toBeVisible()
  expect(screen.getByRole('button', { name: /历史项目/ })).toBeVisible()
  expect(screen.getByText('剩余 3 次')).toBeVisible()
  expect(document.querySelector('.commerce-page-intro')).not.toBeInTheDocument()
})

it('marks the site shell as a commerce workspace route', async () => {
  window.location.hash = '#ai-commerce'
  render(<App />)
  expect(document.querySelector('.site-shell')).toHaveClass('is-commerce-page')
})
```

- [ ] **Step 2: Run shell tests and verify failure**

Run: `npm.cmd test -- tests/commerce-form.test.tsx tests/homepage-content.test.tsx`

Expected: FAIL because the new header and shell class are absent.

- [ ] **Step 3: Implement `CommerceStudioHeader`**

```ts
type CommerceStudioHeaderProps = {
  creditsLabel: string
  accountLabel: string
  historyCount: number
  historyTriggerRef: React.RefObject<HTMLButtonElement | null>
  onOpenHistory(): void
}
```

Use a short eyebrow `AI COMMERCE / PRIVATE`, one heading, one short sentence, and two compact controls. Account text must truncate rather than expand the header.

- [ ] **Step 4: Add route-level shell styling hook**

Set:

```tsx
<div className={`site-shell${commercePage ? ' is-commerce-page' : ''}${commerceAdminPage ? ' is-commerce-admin-page' : ''}`}>
```

Use `.site-shell.is-commerce-page .floating-header` to slightly reduce inactive navigation contrast and shadow without changing the homepage appearance.

- [ ] **Step 5: Define workbench tokens**

In `tokens.css`, define semantic custom properties rather than raw colors in components:

```css
.commerce-page {
  --cw-bg: #0b0c0f;
  --cw-surface: #111318;
  --cw-surface-raised: #171a20;
  --cw-line: rgb(255 255 255 / 8%);
  --cw-text: #f2f3ef;
  --cw-text-muted: rgb(242 243 239 / 62%);
  --cw-text-quiet: rgb(242 243 239 / 42%);
  --cw-accent: #b8f57a;
  --cw-danger: #f09a92;
  --cw-radius-card: 16px;
  --cw-radius-control: 11px;
}

:root[data-theme="light"] .commerce-page {
  --cw-bg: #f3f2ee;
  --cw-surface: #fbfaf7;
  --cw-surface-raised: #ffffff;
  --cw-line: rgb(20 22 24 / 11%);
  --cw-text: #17181a;
  --cw-text-muted: rgb(23 24 26 / 65%);
  --cw-text-quiet: rgb(23 24 26 / 46%);
  --cw-accent: #72a53f;
  --cw-danger: #b94e48;
}
```

Accent-filled area must remain visually small; ordinary fields and cards use neutral surfaces.

- [ ] **Step 6: Implement desktop and tablet layout**

In `studio-layout.css`:

- `.commerce-page`: `width: min(1280px, calc(100% - clamp(48px, 8vw, 128px)))`.
- Compact header: 140–176px high including bottom rule.
- Main workspace: `grid-template-columns: minmax(0, 1fr) minmax(280px, 312px)` with 40–56px gap.
- Remove the permanent history column and all empty grid height tied to it.
- At `max-width: 1024px`, switch to one column and render the run panel below the editor as a horizontal summary/action surface.

- [ ] **Step 7: Implement form, status, and drawer visuals**

Use 4px spacing rhythm, 14–15px body text, labels at least 11px, 44px controls, and 14–18px card radii. Replace the current full-width bright button with an action-row button capped near 220px. Keep one thin progress line and one state dot; no duplicate pulse animations.

- [ ] **Step 8: Implement mobile layout and reduced motion**

At `max-width: 640px`:

- page horizontal margin is 12px;
- header title is `clamp(28px, 9vw, 32px)`;
- show one form step at a time;
- bottom action surface uses `position: sticky` and safe-area padding;
- reserve 70px above the safe area for the compact music launcher;
- drawer becomes full viewport width;
- no element may set a fixed width larger than `calc(100vw - 24px)`.

Under `prefers-reduced-motion: reduce`, remove step translation, drawer slide, pulsing, and decorative animation.

- [ ] **Step 9: Run component tests and build**

Run: `npm.cmd test -- tests/commerce-form.test.tsx tests/commerce-history-drawer.test.tsx tests/homepage-content.test.tsx`

Expected: PASS.

Run: `npm.cmd run build`

Expected: PASS with no TypeScript or CSS import errors.

- [ ] **Step 10: Commit the visual system**

```powershell
git add src/commerce/CommerceStudioHeader.tsx src/commerce/styles src/commerce/commerce.css src/commerce/CommerceStudioPage.tsx src/App.tsx src/components/floating-header.css tests/commerce-form.test.tsx tests/homepage-content.test.tsx
git commit -m "style: rebuild commerce workspace hierarchy"
```

---

### Task 7: Eliminate Music-Dock Click Interception

**Files:**
- Modify: `src/music/GlobalMusicDock.tsx`
- Modify: `src/music/music-experience.css:448-504`
- Modify: `tests/homepage-content.test.tsx`

**Interfaces:**
- Consumes: `commerceMode`, player open state, playlist open state.
- Produces: a compact launcher whose closed parent cannot intercept unrelated page clicks.

- [ ] **Step 1: Add a failing CSS/DOM contract test**

```ts
it('keeps only the closed commerce music launcher interactive', () => {
  const css = readFileSync('src/music/music-experience.css', 'utf8')
  expect(css).toMatch(/\.music-dock\s*\{[^}]*pointer-events:\s*none/s)
  expect(css).toMatch(/\.music-launcher\s*\{[^}]*pointer-events:\s*auto/s)
  expect(css).toMatch(/\.music-dock\.is-open\s+\.music-popover\s*\{[^}]*pointer-events:\s*auto/s)
})
```

Also render `GlobalMusicDock commerceMode` and assert its hidden popover remains `inert` and `aria-hidden="true"` until the launcher opens.

- [ ] **Step 2: Run the contract test and verify failure**

Run: `npm.cmd test -- tests/homepage-content.test.tsx`

Expected: FAIL because the dock root does not currently disable pointer events.

- [ ] **Step 3: Implement deterministic hit areas**

Apply:

```css
.music-dock { pointer-events: none; }
.music-launcher { pointer-events: auto; }
.music-popover { pointer-events: none; }
.music-dock.is-open .music-popover { pointer-events: auto; }
```

Keep the launcher at 44px or larger. In commerce mode, place it above the mobile action surface and avoid any invisible full-width wrapper. Do not raise its z-index above an open modal/history drawer.

- [ ] **Step 4: Run the dock contract and full component suite**

Run: `npm.cmd test -- tests/homepage-content.test.tsx tests/commerce-admin.test.tsx tests/commerce-form.test.tsx`

Expected: PASS; admin entitlement buttons remain reachable and workbench actions are not overlapped.

- [ ] **Step 5: Commit the hit-area fix**

```powershell
git add src/music/GlobalMusicDock.tsx src/music/music-experience.css tests/homepage-content.test.tsx
git commit -m "fix: prevent music dock click interception"
```

---

### Task 8: Run Complete Automated and Browser Verification

**Files:**
- Modify: `docs/project-log.md`
- Create during verification only, do not commit: `output/playwright/commerce-workbench-*.png`

**Interfaces:**
- Consumes: the completed local application and all existing test suites.
- Produces: reproducible automated results, three viewport screenshots, console/network observations, and a maintenance-log entry.

- [ ] **Step 1: Run the complete unit suite**

Run: `npm.cmd test`

Expected: all tests PASS; no skipped commerce authentication, workflow, history, admin, or route tests.

- [ ] **Step 2: Run production build and Edge checks**

Run: `npm.cmd run build`

Expected: PASS and `dist/` is generated.

Run: `npm.cmd run check:edge`

Expected: PASS for `analyze-commerce`, `commerce-upload`, and cleanup functions.

- [ ] **Step 3: Start a local preview**

Run in a yielded terminal cell:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Expected: Vite reports a local URL. Record its port without changing checked-in configuration.

- [ ] **Step 4: Verify the anonymous gate at all target sizes with Playwright CLI**

Use a fresh session and snapshot before refs:

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=commerce-redesign open http://127.0.0.1:5173/#ai-commerce --headed
npx.cmd --yes --package @playwright/cli playwright-cli -s=commerce-redesign resize 1440 1000
npx.cmd --yes --package @playwright/cli playwright-cli -s=commerce-redesign snapshot
npx.cmd --yes --package @playwright/cli playwright-cli -s=commerce-redesign screenshot
```

Repeat at `1024×900` and `390×844`. Verify the gate has one CTA, the header fits, the music launcher does not overlap it, and `document.documentElement.scrollWidth === window.innerWidth` at 390px.

- [ ] **Step 5: Verify an authenticated local workflow**

In the headed session, allow the user to complete OAuth if needed. Then use snapshot refs to:

1. enter a product name;
2. upload one small valid JPEG/PNG/WebP owned by the user;
3. select a market;
4. accept the material confirmation;
5. submit;
6. observe upload and generation states;
7. open history and close it with Escape.

Inspect `requests` and `console` without printing request headers. Expected: function request succeeds, only one primary action is visible, no ghost project remains after a forced mocked failure, and console has zero application errors.

- [ ] **Step 6: Verify light and reduced-motion modes**

Switch the site to light mode, capture one desktop and one mobile screenshot, and verify text contrast and surface separation. Start a separate browser context with reduced-motion emulation if supported; otherwise use DevTools to set it before navigation. Confirm step/drawer transitions do not animate continuously.

- [ ] **Step 7: Record verification in the project log**

Add a dated entry to `docs/project-log.md` containing:

- the four defects fixed;
- exact test/build commands and pass counts;
- inspected viewport sizes;
- confirmation that no secrets or auth headers were captured;
- remaining limitations: OAuth redirect cannot retain local file objects.

- [ ] **Step 8: Commit the verification record**

```powershell
git add docs/project-log.md
git commit -m "docs: record commerce workbench verification"
```

---

### Task 9: Publish and Run a Production Smoke Test

**Files:**
- Update deploy worktree from generated `dist/` only.
- Modify after smoke if needed: `docs/project-log.md`

**Interfaces:**
- Consumes: clean source branch, successful build, existing GitHub Pages deployment workflow, and `https://geniusli.cn/#ai-commerce`.
- Produces: published static bundle and a production smoke result tied to exact commits.

- [ ] **Step 1: Confirm clean source and deploy worktrees**

Run:

```powershell
git status --short
git -C .deploy-worktree status --short
```

Expected: both outputs are empty. If either contains unrelated user changes, stop deployment and preserve them.

- [ ] **Step 2: Rebuild once from the reviewed source commit**

Run: `npm.cmd run build`

Expected: PASS. Record `git rev-parse --short HEAD` for the operations log; do not include environment values.

- [ ] **Step 3: Replace only the deploy worktree site payload**

Resolve `D:\wendang\ChatGPT\个人网站\.deploy-worktree` as the exact target and verify it is a Git worktree before removing its previous generated site files. Preserve `.git`, `CNAME`, and deployment metadata required by the existing workflow. Copy the newly generated `dist/` contents into that worktree.

Run: `git -C .deploy-worktree diff --check`

Expected: no whitespace errors and only generated site payload changes.

- [ ] **Step 4: Commit and push the deployment**

```powershell
git -C .deploy-worktree add --all
git -C .deploy-worktree commit -m "deploy: rebuild commerce workspace"
git -C .deploy-worktree push origin HEAD:main
```

Expected: push succeeds. Wait for the GitHub Pages workflow associated with that commit to complete successfully before smoke testing.

- [ ] **Step 5: Run the production browser smoke**

Open `https://geniusli.cn/#ai-commerce` in a fresh headed Playwright session. Verify asset filenames match the new deployment, console has no application errors, and layout passes at 1440 and 390 widths.

With the station-owner account, run one legal small-image submission. Expected:

- database project creation succeeds;
- `commerce-upload` succeeds with the signed-in user session;
- DeepSeek task starts or returns a truthful provider failure;
- one credit is consumed only after accepted generation and refunded under the existing failure contract;
- history shows no cleaned ghost project;
- hidden music UI does not intercept any page or admin button.

- [ ] **Step 6: Record the production commit and smoke result**

Update `docs/project-log.md` with the source commit, deploy commit, workflow result, smoke timestamp, and outcome. Do not record user IDs, emails, tokens, request headers, signed URLs, or secret values.

- [ ] **Step 7: Commit the final operations entry**

```powershell
git add docs/project-log.md
git commit -m "docs: record commerce redesign deployment"
```

---

## Plan Self-Review

- **Spec coverage:** Tasks 1–3 cover error classification, session recovery, one-action state flow, retries, stale guards, cleanup, and ghost history; Tasks 4–7 cover the editor, run panel, history drawer, visual system, responsive behavior, accessibility, and music hit areas; Tasks 8–9 cover automated, browser, production, and operations verification.
- **Scope:** The plan does not change the DeepSeek result protocol, `CommerceResult`, credits/refunds, seven-day cleanup, homepage, guestbook, music visualization, or the full admin visual system.
- **Type consistency:** `CommerceRunState`, `CommerceFormSnapshot`, session helper names, drawer props, and error codes are defined before their consumers and used consistently.
- **Security:** Explicit function authentication is bounded to one retry, secrets never enter logs/snapshots, and browser storage contains text draft only.
- **No placeholders:** Every task has exact files, public interfaces, concrete assertions, commands, expected results, and a commit boundary.

