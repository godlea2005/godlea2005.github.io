# Task 4 Report: Deterministic Provider Timeout and Cleanup Reconciliation

Status: DONE

## Implementation Summary

- `createOpenAiProvider` now creates one `AbortController` per provider request, schedules a default
  60,000 ms deadline, passes its signal to `fetch`, clears the timer in `finally`, and maps only its
  own abort to safe code `PROVIDER_TIMEOUT`. `OPENAI_TIMEOUT_MS` accepts finite positive values and
  clamps them to 5,000..90,000 ms; missing, non-numeric, and non-positive values use 60,000 ms.
- Generation completion/failure now relies on the atomic terminal database RPCs for normal asset
  restoration. The runtime retains a guarded `ready` fallback only when assets were marked
  `processing` and neither terminal RPC could be confirmed committed.
- Acquired cleanup runs now reconcile historical terminal assets first, then cursor-page abandoned
  uploads and orphan Storage objects in deterministic 100-item pages with a strict 500-item bound
  per kind. They then preserve the existing stale-generation, adopted deleting-claim, expiry, and
  soft-limit flows.
- Abandoned cleanup delegates to Task 2's exported `cleanupAbandonedCommerceUpload` with its exact
  `CommerceUploadServiceClient` contract. The helper performs cutoff-checked takeover, confirmed
  Storage removal, and only then the attempt-bound fail transition. Removal failure releases the
  takeover for retry, and `not_claimed` does not steal active validation claims.
- Recovery failures add only bounded stage/code/item-ID details (maximum 25) and do not prevent later
  items or subsequent recovery phases from running. Active `validating` assets are excluded from
  ordinary expiry/soft-limit selection.
- The cleanup workflow remains manual-triggerable, minimally privileged, secret-env-only, and
  five-minute bounded, while its schedule is now `*/15 * * * *`.

## RED Evidence

Tests were changed before production code.

- `node --experimental-strip-types --test supabase/functions/analyze-commerce/index.test.ts`
  - Expected RED: 25 tests, 19 passed / 6 failed.
  - Key failures: scheduled delay remained `0` instead of `5000`/`60000`, no timeout callback was
    installed, and successful/failed terminal paths still emitted the duplicate `assets:ready`.
- `node --experimental-strip-types --test supabase/functions/cleanup-commerce-assets/index.test.ts`
  - Expected RED: 22 tests, 17 passed / 5 failed.
  - Key failures: terminal reconciliation was absent, paged recovery counters stayed at zero,
    status remained `completed` instead of `partial`, and the Supabase adapter lacked
    `reconcileTerminalAssets` / `cleanupAbandonedUpload`.
- `npm.cmd test -- tests/commerce-cleanup-contract.test.ts`
  - Expected RED: 10 tests, 9 passed / 1 failed because the workflow still used `20 19 * * *`.

These failures were expected because the old provider had no application deadline, terminal runtime
always performed best-effort restoration, cleanup did not consume the new recovery RPCs/helper, and
the workflow was daily.

## GREEN and Verification

- `node --experimental-strip-types --test supabase/functions/analyze-commerce/index.test.ts`
  - PASS: 25/25.
- `node --experimental-strip-types --test supabase/functions/cleanup-commerce-assets/index.test.ts`
  - PASS: 22/22.
- `npm.cmd test -- supabase/functions/analyze-commerce/index.test.ts supabase/functions/cleanup-commerce-assets/index.test.ts tests/commerce-cleanup-contract.test.ts`
  - PASS: 3 files / 57 tests.
- `npm.cmd test`
  - PASS: 13 files / 227 tests.
- `npm.cmd run build`
  - PASS. The pre-existing `MusicPage` chunk-size warning above 500 kB remains unchanged.
- `npm.cmd exec tsc -- --ignoreConfig --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom --allowImportingTsExtensions supabase/functions/_shared/ai-provider.ts supabase/functions/_shared/commerce-runtime.ts supabase/functions/_shared/cleanup-runtime.ts`
  - PASS.
- `git diff --check`
  - PASS; only the repository's Windows LF/CRLF conversion warnings were printed.
- Task-file credential scan for long `sk-` values, JWT-shaped values, and secret/service/OpenAI Vite
  variables
  - PASS: `credential_like_matches=0`.
- `git status --short` plus `.deploy-worktree` match count
  - PASS: only the seven Task 4 source/test/workflow files plus this report and ledger are scoped;
    `.deploy-worktree` matches = 0.

## Files Changed

- `.github/workflows/cleanup-commerce-assets.yml`
- `supabase/functions/_shared/ai-provider.ts`
- `supabase/functions/_shared/commerce-runtime.ts`
- `supabase/functions/_shared/cleanup-runtime.ts`
- `supabase/functions/analyze-commerce/index.test.ts`
- `supabase/functions/cleanup-commerce-assets/index.test.ts`
- `tests/commerce-cleanup-contract.test.ts`
- `.superpowers/sdd/2026-08-31-commerce-upload-security-implementation/task-4-report.md`
- `.superpowers/sdd/2026-08-31-commerce-upload-security-implementation/progress.md`

## Self-Review

- Verified completeness and interface fidelity against Task 4, Task 2 Fix Round 2, Task 3, the
  migration cursor/RPC contracts, and the exact Task 2 takeover helper.
- Verified timeout timer cleanup, provider-error secrecy, atomic terminal ownership, recovery order,
  retryability after Storage failure, deterministic cursor advancement, strict per-run caps, bounded
  safe errors, active validation-claim preservation, deleting-claim adoption, and stale generation
  recovery.
- Self-review found two missing assertions: active `validating` rows were not explicitly covered in
  ordinary candidate selection, and recovery did not assert the exact 15-minute cutoff/fresh UUID
  attempts. Both tests were added; affected Node fallback and the full suite remained green.
- No placeholders, unrelated refactors, direct `storage` schema mutation, client secrets, workflow
  secret output, or browser-exposed privileged values were introduced.

## External Gates and Safety Statement

- Deno and Supabase CLIs are unavailable locally. Native Deno test/bundle/startup and disposable
  PostgreSQL/Supabase Storage integration remain explicit deployment gates and are not reported as
  passed. Staging must verify real AbortSignal behavior, RPC execution/grants, takeover concurrency,
  active-claim refusal, Storage removal retry/convergence, cursor pagination, and transactional
  terminal restoration.
- No remote project was linked; no push, deployment, migration application, workflow trigger,
  database/Storage mutation, or Secrets write/read occurred.
- No service-role/secret key or `OPENAI_API_KEY` was exposed to browser code, Vite variables,
  workflow output, logs, documentation, or tests. `.deploy-worktree/` was not accessed or staged.
