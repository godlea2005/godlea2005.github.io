# Commerce Upload Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the authenticated upload bypass, make generation terminal transitions restore assets atomically, and bound/recover provider failures before the AI commerce branch can merge.

**Architecture:** A new authenticated `commerce-upload` Edge Function reserves an asset through a row-locked RPC, issues a service-created signed upload token, then downloads and validates the uploaded object before a service-only finalize RPC marks it ready. A forward migration removes direct authenticated asset/Storage creation, makes generation terminal writes restore assets in the same transaction, and exposes narrowly granted reconciliation queries to the cleanup function. The existing browser form keeps its progress UX but talks only to the upload gateway.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase JS 2.112.3, PostgreSQL/RLS, Supabase Edge Functions (Deno), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-commerce-upload-security-design.md`

## Global Constraints

- Do not push, deploy, link a remote project, apply migrations, write Secrets, or mutate production.
- Do not expose the service-role/secret key or `OPENAI_API_KEY` to browser code, Vite variables, workflow output, logs, documentation, or tests.
- Allowed images remain JPEG, PNG, or WebP; maximum `8388608` bytes per file; effective project maximum comes from `app_settings.max_project_images` and defaults to `6`.
- Object paths are generated server-side as `<authenticated-user-uuid>/<project-uuid>/<random-uuid>.<jpg|png|webp>`.
- Asset expiry remains seven days; project locking only prevents soft-limit early cleanup.
- New database changes use a forward migration and preserve upgrade compatibility with all five existing AI-commerce migrations.
- `.deploy-worktree/` and unrelated user changes are never staged.
- Deno/Postgres/Storage integration that cannot run locally remains an explicit deployment gate and must not be reported as passed.

---

### Task 1: Database upload authority and atomic terminal recovery

**Files:**
- Create: `supabase/migrations/202608310001_commerce_upload_security.sql`
- Modify: `tests/commerce-cleanup-contract.test.ts`
- Modify: `tests/commerce-repository.test.ts`

**Interfaces:**
- Produces authenticated RPC `reserve_commerce_asset(p_project_id uuid, p_extension text, p_mime_type text, p_size_bytes bigint)` returning the persisted asset fields.
- Produces service-only RPCs `finalize_commerce_asset_upload(p_asset_id uuid, p_user_id uuid, p_actual_mime_type text, p_actual_size_bytes bigint)`, `fail_commerce_asset_upload(p_asset_id uuid, p_user_id uuid)`, `reconcile_terminal_commerce_assets()`, `list_abandoned_commerce_uploads(p_cutoff timestamptz, p_after_id uuid, p_limit integer)`, and `list_orphan_commerce_storage_objects(p_after_name text, p_limit integer)`.
- Replaces `complete_commerce_generation` and `fail_commerce_generation` bodies without changing their signatures.
- Consumed by Tasks 2 and 4.

- [ ] **Step 1: Add failing migration contract tests**

Assert exact security properties, not only function-name strings:

```ts
expect(migration).toMatch(/revoke insert, update, delete on public\.commerce_project_assets from authenticated/i)
expect(migration).toMatch(/drop policy if exists "commerce_storage_insert_own" on storage\.objects/i)
expect(migration).toMatch(/max_project_images[\s\S]*count\(\*\)[\s\S]*for update/i)
expect(migration).toMatch(/auth\.role\(\) is distinct from 'service_role'/i)
expect(migration).toMatch(/status = 'completed'[\s\S]*commerce_project_assets[\s\S]*state = 'ready'/i)
expect(migration).toMatch(/status = 'failed'[\s\S]*commerce_project_assets[\s\S]*state = 'ready'/i)
expect(migration).toContain('grant execute on function public.reserve_commerce_asset(uuid, text, text, bigint) to authenticated;')
expect(migration).toContain('grant execute on function public.finalize_commerce_asset_upload(uuid, uuid, text, bigint) to service_role;')
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test -- tests/commerce-cleanup-contract.test.ts tests/commerce-repository.test.ts`  
Expected: FAIL because the forward migration and RPC contracts do not exist.

- [ ] **Step 3: Implement the forward migration**

The migration must:

```sql
revoke insert, update, delete on public.commerce_project_assets from authenticated;
drop policy if exists "commerce_assets_insert_own" on public.commerce_project_assets;
drop policy if exists "commerce_assets_update_own" on public.commerce_project_assets;
drop policy if exists "commerce_assets_delete_own" on public.commerce_project_assets;
drop policy if exists "commerce_storage_insert_own" on storage.objects;
```

`reserve_commerce_asset` must reject anonymous sessions, null/foreign projects, active deletion claims, invalid extension/MIME pairs, size outside `1..8388608`, and a count of non-deleted states `uploading|ready|processing|deleting` at or above `max_project_images`. Lock the project row before counting/inserting. Generate the path in PostgreSQL; do not accept a path from the caller.

Finalize/fail functions require `auth.role() = 'service_role'`, verify both asset ID and user ID, and allow only `uploading`→`ready|failed`. Finalize requires actual size to equal reserved size and actual MIME to equal reserved MIME. Repeated finalize of an already-ready matching row is a success; invalid state or mismatch fails closed.

Redefined complete/fail generation functions must lock the generation, preserve current idempotent refund behavior, write the terminal status, and in the same transaction restore `processing` assets for the generation's project only when no other generation on that project remains `queued|processing`.

`reconcile_terminal_commerce_assets()` performs the same no-active-generation check for historical rows. Abandoned upload listing uses `(created_at, id)` or UUID cursor deterministically and only returns `uploading` rows older than the cutoff. Orphan listing reads `storage.objects` for bucket `commerce-assets`, left joins by exact `storage_path`, and pages by `name` with a maximum server-validated limit of 500. All new functions use `security definer`, `set search_path = ''`, `revoke all ... from public, anon, authenticated, service_role`, then grant only the stated role.

- [ ] **Step 4: Run focused tests and migration scan**

Run: `npm.cmd test -- tests/commerce-cleanup-contract.test.ts tests/commerce-repository.test.ts`  
Expected: PASS. Also run `git diff --check` and verify no direct authenticated asset writes remain after the final migration.

- [ ] **Step 5: Commit Task 1**

```powershell
git add supabase/migrations/202608310001_commerce_upload_security.sql tests/commerce-cleanup-contract.test.ts tests/commerce-repository.test.ts
git commit -m "fix: lock commerce upload authority"
```

---

### Task 2: Signed upload gateway with trusted file inspection

**Files:**
- Create: `supabase/functions/_shared/commerce-upload-runtime.ts`
- Create: `supabase/functions/commerce-upload/index.ts`
- Create: `supabase/functions/commerce-upload/index.test.ts`
- Modify: `supabase/config.toml`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes Task 1 RPCs.
- Produces POST `commerce-upload` actions:
  - `{ action: 'reserve', projectId, fileName, mimeType, sizeBytes }` → `{ asset, path, token }`.
  - `{ action: 'finalize', assetId }` → `{ asset }`.
- Produces pure helpers `detectImageMime(bytes: Uint8Array)` and `createCommerceUploadHandler(dependencies)` for Deno/Node contract tests.

- [ ] **Step 1: Write failing runtime/handler tests**

Cover: missing/anonymous auth 401; invalid action/body 400; reserve never accepts caller path; server RPC receives normalized extension/MIME/size; signed token comes only from service Storage; finalize checks ownership; missing object, size mismatch, MIME mismatch, bad PNG/JPEG/WebP magic, SVG/polyglot text and oversize all remove the object and mark the row failed; success finalizes once; repeated finalize is idempotent; client-visible errors contain no provider/storage internals.

Magic signatures:

```ts
const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const WEBP_RIFF = 'RIFF'
const WEBP_KIND = 'WEBP' // bytes 8..11
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run the existing Node-compatible Edge fallback used by `analyze-commerce` plus `npm.cmd test`.  
Expected: FAIL because the runtime/function do not exist.

- [ ] **Step 3: Implement pure upload runtime**

Authenticate with the caller's Bearer token via the same non-anonymous rules as analyze-commerce. For reserve, derive extension exclusively from the allowed MIME, call the authenticated RPC, then call service Storage `createSignedUploadUrl(asset.storage_path)`; if token creation fails, call service fail RPC. For finalize, read the owned uploading asset using an authenticated select, download with service Storage, reject actual size `>8388608` or unequal to reserved size, derive MIME from magic bytes, require it equal to reserved MIME, then call service finalize RPC. Always attempt object removal before fail RPC on validation failure; errors in cleanup are logged only as safe structured stages.

Configure `[functions.commerce-upload] verify_jwt = false` only because the function performs its own `auth.getUser()` validation. Use exact static Supabase imports in `index.ts`; environment reads are lazy and support the same new/legacy Supabase key priority as the other functions.

- [ ] **Step 4: Run focused tests and strict checks**

Run the new Node/Deno-compatible test fallback, `npm.cmd test`, TypeScript build, import/secret scans. Expected: PASS; if Deno CLI is absent, record native Deno as an external gate rather than claiming it passed.

- [ ] **Step 5: Commit Task 2**

```powershell
git add supabase/functions/_shared/commerce-upload-runtime.ts supabase/functions/commerce-upload/index.ts supabase/functions/commerce-upload/index.test.ts supabase/config.toml supabase/README.md
git commit -m "feat: add trusted commerce upload gateway"
```

---

### Task 3: Browser repository signed-upload integration

**Files:**
- Modify: `src/commerce/commerceRepository.ts`
- Modify: `tests/commerce-repository.test.ts`

**Interfaces:**
- Consumes Task 2 reserve/finalize API and Supabase `uploadToSignedUrl(path, token, file, { contentType })`.
- Preserves public `uploadAssets(projectId, files, onProgress): Promise<CommerceAsset[]>` and existing progress/error semantics.

- [ ] **Step 1: Replace repository mock expectations with failing secure-flow tests**

Assert each file calls reserve → signed upload → finalize in order; raw `from('commerce_project_assets').insert/update/delete` and `storage.upload()` are never used. Test partial failures at each stage, token/path absence, finalize retry for the same reserved asset, account gate, six local files, and progress states.

- [ ] **Step 2: Run focused repository tests and confirm RED**

Run: `npm.cmd test -- tests/commerce-repository.test.ts`  
Expected: FAIL on old direct-row/direct-upload calls.

- [ ] **Step 3: Implement secure upload flow**

Add private helpers:

```ts
type UploadReservation = { asset: CommerceAsset; path: string; token: string }
reserveUpload(projectId: string, file: File): Promise<UploadReservation>
finalizeUpload(assetId: string): Promise<CommerceAsset>
```

Invoke `commerce-upload` with only the documented bodies; decode `FunctionsHttpError` through the existing async mapper. Use `storage.from('commerce-assets').uploadToSignedUrl(reservation.path, reservation.token, file, { contentType: file.type })`. On upload transport failure call finalize only on retry, not a new reserve; preserve the reservation within the current `uploadAssets` attempt. Do not restore any authenticated asset table writes.

- [ ] **Step 4: Run focused/full tests and build**

Run: `npm.cmd test -- tests/commerce-repository.test.ts`, `npm.cmd test`, `npm.cmd run build`. Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/commerce/commerceRepository.ts tests/commerce-repository.test.ts
git commit -m "fix: route product images through signed uploads"
```

---

### Task 4: Deterministic provider timeout and cleanup reconciliation

**Files:**
- Modify: `supabase/functions/_shared/ai-provider.ts`
- Modify: `supabase/functions/analyze-commerce/index.test.ts`
- Modify: `supabase/functions/_shared/commerce-runtime.ts`
- Modify: `supabase/functions/_shared/cleanup-runtime.ts`
- Modify: `supabase/functions/cleanup-commerce-assets/index.test.ts`
- Modify: `.github/workflows/cleanup-commerce-assets.yml`
- Modify: `tests/commerce-cleanup-contract.test.ts`

**Interfaces:**
- `createOpenAiProvider({ fetchFn, getEnv, setTimeoutFn?, clearTimeoutFn? })` defaults to a 60000 ms deadline; `OPENAI_TIMEOUT_MS` may override only within a safe `5000..90000` range.
- CleanupStore adds `reconcileTerminalAssets()`, paged abandoned uploads, paged orphan objects, object removal and trusted fail-upload operations.

- [ ] **Step 1: Write failing timeout and reconciliation tests**

Use fake timers/AbortController to prove a hanging fetch aborts, clears its timer, throws `SafeProviderError` code `PROVIDER_TIMEOUT`, and the generation process calls fail/refund through the normal path. Cleanup tests must prove terminal reconciliation runs before candidate selection, abandoned upload objects are removed then marked failed, orphan paths are removed in deterministic pages, failures produce bounded safe detail records, and later assets continue. Workflow contract expects `cron: '*/15 * * * *'`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run analyze/cleanup fallback tests and `npm.cmd test -- tests/commerce-cleanup-contract.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the 60-second deadline**

Create one AbortController per request, schedule abort, pass `signal` to fetch, clear the timer in `finally`, and distinguish `controller.signal.aborted` from network failure. Never echo the provider exception. Invalid/missing timeout env uses 60000; clamp valid values to the safe range.

- [ ] **Step 4: Implement cleanup reconciliation and schedule**

At the beginning of an acquired cleanup run: reconcile terminal assets; page and remove abandoned-upload and orphan objects with an upper per-run bound; update/mark database rows only after Storage removal success, and keep safe stage/code/id error details on failure. Then run stale generations and normal expired/soft-limit candidates. Change the scheduled workflow to every 15 minutes while preserving manual trigger, timeout and secret handling.

- [ ] **Step 5: Run focused/full checks**

Run Node Edge fallbacks, all focused Vitest files, `npm.cmd test`, `npm.cmd run build`, `git diff --check`, credential scan. Expected: PASS; native Deno/Postgres remains an explicit gate if unavailable.

- [ ] **Step 6: Commit Task 4**

```powershell
git add supabase/functions/_shared/ai-provider.ts supabase/functions/analyze-commerce/index.test.ts supabase/functions/_shared/commerce-runtime.ts supabase/functions/_shared/cleanup-runtime.ts supabase/functions/cleanup-commerce-assets/index.test.ts .github/workflows/cleanup-commerce-assets.yml tests/commerce-cleanup-contract.test.ts
git commit -m "fix: recover commerce background failures"
```

---

### Task 5: Operations docs and final security gate

**Files:**
- Modify: `docs/ai-commerce-operations.md`
- Modify: `docs/project-log.md`
- Modify: `tests/deployment-contract.test.ts`

**Interfaces:**
- Consumes Tasks 1–4.
- Produces truthful deployment order and staging checks for the new migration/function/recovery behavior.

- [ ] **Step 1: Write failing documentation contract assertions**

Require migration `202608310001_commerce_upload_security.sql`, function `commerce-upload`, signed upload/finalize order, 60-second timeout, 15-minute cleanup, orphan/abandoned reconciliation, and staging denial cases. Reject claims that native Deno/Postgres/Storage integration already passed.

- [ ] **Step 2: Update operations and project log**

Deployment order is migrations → `commerce-upload`/`analyze-commerce`/`cleanup-commerce-assets` functions → server secrets → GitHub variables/secrets → disposable-account staging checks → Pages. Add exact tests for direct orphan upload denial, seventh image, forged MIME/size, cross-user path, interrupted finalize, atomic terminal recovery, timeout refund and orphan cleanup. Do not include real project refs or key values.

- [ ] **Step 3: Run final verification**

Run focused docs contract, `npm.cmd test`, `npm.cmd run build`, `git diff --check`, status, credential scan. Expected: all pass; record the existing MusicPage chunk warning separately.

- [ ] **Step 4: Commit Task 5**

```powershell
git add docs/ai-commerce-operations.md docs/project-log.md tests/deployment-contract.test.ts
git commit -m "docs: finalize secure commerce upload operations"
```

---

## Self-review

- Spec coverage: upload authority/6-image/magic/size validation → Tasks 1–3; terminal atomicity and historical repair → Tasks 1/4; provider timeout → Task 4; orphan/abandoned reconciliation → Tasks 1/2/4; docs/gates → Task 5.
- Interfaces are consistent: the migration produces exactly the RPC names consumed by both Edge runtimes; the browser only sees the two `commerce-upload` actions; cleanup owns reconciliation.
- No placeholders or undefined later interfaces remain. Pagination UI is intentionally excluded as a recorded Minor.
- Every task has a red test, focused green test, bounded commit, and independent review gate.
