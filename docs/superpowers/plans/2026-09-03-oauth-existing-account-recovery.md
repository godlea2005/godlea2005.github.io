# OAuth Existing-Account Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an anonymous visitor automatically retry as a normal GitHub or Google sign-in when Supabase reports that the OAuth email or identity already belongs to an existing account.

**Architecture:** Keep the existing link-first OAuth state machine and add one narrow account-conflict predicate. Only a stored `link` intent paired with `email_exists` or `identity_already_exists` may transition to `sign-in`; the next callback cannot retry again, which prevents redirect loops.

**Tech Stack:** React 19, TypeScript, Supabase JS Auth, Vitest, Testing Library, Vite, Playwright CLI

**Spec:** `docs/superpowers/specs/2026-09-03-oauth-existing-account-recovery-design.md`

## Global Constraints

- Anonymous visitors continue to call `linkIdentity()` first.
- Only `email_exists` and `identity_already_exists` can recover from `link` to `sign-in`.
- A `sign-in` intent must never trigger another automatic OAuth attempt.
- The provider and stored return hash must survive the single recovery redirect.
- No OAuth Client Secret or session token may enter source files, test output, build artifacts, or logs.
- Unknown OAuth, PKCE, provider, and network failures remain visible errors and do not retry.

---

### Task 1: Specify the OAuth conflict state transition

**Files:**
- Modify: `tests/auth-provider.test.tsx`

**Interfaces:**
- Consumes: OAuth callback query parameters and `wenhao-site:oauth-intent` session storage.
- Produces: Regression coverage for the `link -> sign-in` transition and its loop guard.

- [ ] **Step 1: Generalize the existing identity-conflict test to both supported codes**

Replace the single `identity_already_exists` callback case with a table-driven test:

```tsx
it.each(['identity_already_exists', 'email_exists'])(
  'retries %s link callbacks as a sign-in without losing provider or return hash',
  async (errorCode) => {
    window.history.replaceState({}, '', `/?auth=site&error_code=${errorCode}#ignored`)
    window.sessionStorage.setItem('wenhao-site:return-hash', '#guestbook')
    window.sessionStorage.setItem(
      'wenhao-site:oauth-intent',
      JSON.stringify({ provider: 'github', mode: 'link' }),
    )
    render(<AuthProvider><OAuthProbe /></AuthProvider>)

    await waitFor(() => expect(mocks.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github' }),
    ))

    expect(mocks.auth.linkIdentity).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('wenhao-site:oauth-intent')).toContain('"mode":"sign-in"')
    expect(window.sessionStorage.getItem('wenhao-site:return-hash')).toBe('#guestbook')
  },
)
```

- [ ] **Step 2: Add the no-loop regression case**

```tsx
it('does not retry an account conflict that already came from normal sign-in', async () => {
  window.history.replaceState({}, '', '/?auth=site&error_code=email_exists#ignored')
  window.sessionStorage.setItem('wenhao-site:return-hash', '#guestbook')
  window.sessionStorage.setItem(
    'wenhao-site:oauth-intent',
    JSON.stringify({ provider: 'github', mode: 'sign-in' }),
  )
  render(<AuthProvider><OAuthProbe /></AuthProvider>)

  await waitFor(() => expect(window.location.search).toBe(''))

  expect(mocks.auth.signInWithOAuth).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('#guestbook')
  expect(window.sessionStorage.getItem('wenhao-site:oauth-intent')).toBeNull()
})
```

- [ ] **Step 3: Run the focused tests and verify the new `email_exists` case fails**

Run: `npm.cmd test -- tests/auth-provider.test.tsx`

Expected: the new `email_exists` recovery case fails because `signInWithOAuth()` is not called; existing cases remain green.

---

### Task 2: Implement the guarded recovery transition

**Files:**
- Modify: `src/auth/AuthProvider.tsx`
- Test: `tests/auth-provider.test.tsx`

**Interfaces:**
- Consumes: `OAuthIntent | null` and the Supabase callback error code.
- Produces: `canRetryOAuthAsSignIn(code, intent): boolean`, used only by callback initialization.

- [ ] **Step 1: Add a focused predicate next to the OAuth intent helpers**

```tsx
const oauthAccountConflictCodes = new Set(['email_exists', 'identity_already_exists'])

const canRetryOAuthAsSignIn = (code: string, intent: OAuthIntent | null) =>
  intent?.mode === 'link' && oauthAccountConflictCodes.has(code)
```

- [ ] **Step 2: Use the predicate in the callback state machine**

Change the callback error branch to:

```tsx
const intent = readOAuthIntent()
if (canRetryOAuthAsSignIn(callbackErrorCode, intent)) {
  await beginOAuth(intent.provider, 'sign-in')
  return { handled: true, navigating: true, session: null, error: '' }
}
```

Keep the existing cleanup, URL normalization, anonymous-session fallback, and visible error handling after this branch unchanged.

- [ ] **Step 3: Add a readable fallback message for `email_exists`**

Add this branch to `explainOAuthError`:

```tsx
if (code === 'email_exists') return '该邮箱已绑定其他账号，请重新选择登录方式'
```

The text is only shown when automatic recovery is ineligible or fails before navigation.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm.cmd test -- tests/auth-provider.test.tsx`

Expected: all auth provider tests pass, including both conflict codes and the `sign-in` loop guard.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- src/auth/AuthProvider.tsx tests/auth-provider.test.tsx
git commit -m "fix: recover oauth login for existing accounts"
```

---

### Task 3: Verify and publish the repaired login flow

**Files:**
- Verify: repository test and build outputs
- Update: `.deploy-worktree/` with the new `dist/` output

**Interfaces:**
- Consumes: the production build from the implementation branch and the configured Supabase GitHub provider.
- Produces: a deployed GitHub Pages build on `https://geniusli.cn` with a verified formal OAuth session.

- [ ] **Step 1: Run the complete repository checks**

Run:

```powershell
npm.cmd test
npm.cmd run check:edge
npm.cmd run build
```

Expected: Vitest reports zero failures, Deno edge-function checking succeeds, and Vite writes `dist/` successfully. The known large MusicPage chunk warning is acceptable; new errors are not.

- [ ] **Step 2: Copy the exact production build into the existing deployment worktree**

First verify both absolute paths and confirm `.deploy-worktree` is the linked worktree for remote `main`. Then remove only tracked deployment artifacts inside `D:\wendang\ChatGPT\个人网站\.deploy-worktree`, copy the complete contents of `D:\wendang\ChatGPT\个人网站\dist`, and inspect `git status --short` from the deployment worktree.

- [ ] **Step 3: Commit and push the deployment artifact branch**

```powershell
git add -A
git commit -m "deploy: fix oauth existing-account login"
git push origin HEAD:main
```

Run these commands from `D:\wendang\ChatGPT\个人网站\.deploy-worktree` only.

- [ ] **Step 4: Wait for the new asset manifest to become live**

Poll `https://geniusli.cn` until its HTML references the newly built hashed entry asset. Stop and report if GitHub Pages does not update within the bounded polling window.

- [ ] **Step 5: Run the real GitHub OAuth journey with Playwright CLI**

Use a headed Playwright session:

1. Open `https://geniusli.cn/#ai-commerce`.
2. Click “登录并进入工作台”, then “GitHub 登录”.
3. Reuse the already authorized GitHub browser session; do not inspect or print credentials or tokens.
4. Verify the browser returns to `#ai-commerce` without `email_exists` or `Unable to exchange external code`.
5. Verify `LOGIN REQUIRED` is absent and the AI workbench is present.
6. Open the account/navigation UI and verify the session is non-anonymous; verify the station-owner label if `site_is_admin()` returns true.
7. Check browser console errors and confirm there are no site-originating errors.

- [ ] **Step 6: Record the operational result**

Append a short dated entry to `docs/project-log.md` describing the OAuth provider credential correction, the guarded existing-account recovery, test totals, deploy commit, and live verification result. Do not include credentials, token fragments, OAuth authorization codes, or user identifiers.

- [ ] **Step 7: Commit the operations log if it changed after the implementation commit**

```powershell
git add -- docs
git commit -m "docs: record oauth recovery deployment"
```
