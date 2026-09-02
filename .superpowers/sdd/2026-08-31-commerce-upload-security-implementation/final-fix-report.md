# Final Branch Fix Report

Date: 2026-09-03
Branch: `codex/ai-commerce-studio`
Review baseline: `11acf8b`
Implementation commit: `1862aaf` (`fix: close final commerce security gaps`)
Scope: only the final branch review's 3 Important + 1 Minor findings.

## Delivered fixes

1. Project deletion now reads owned paths, commits the authoritative `delete_commerce_project` transaction, and only then removes Storage objects. If generation wins the shared fence, the RPC rejects before Storage. If deletion wins, post-commit Storage failure does not claim a database rollback and existing orphan cleanup owns recovery.
2. Append-only migration `202609030001_commerce_project_validation.sql` revokes authenticated direct project INSERT/UPDATE/DELETE and drops the old write policies. Authenticated SECURITY DEFINER create/update/locked RPCs validate identity/ownership, name, platform, mode, an exact ten-field allowlist, string-only values, 2000 characters per field, and a 32768-byte total JSON cap. The repository creates and locks projects only through those RPCs.
3. `admin_refund_commerce_generation` is admin-only and locks generation then entitlement. A charged, unrefunded generation receives exactly +1, `refunded_at`, one generation-scoped `generation_refund` ledger row, and an audited required reason. Repeat/concurrent requests return `already_refunded`; the existing unique generation/reason index and row lock prevent double credit. The admin task table exposes a reasoned, disabled/loading/error-safe action only on eligible rows.
4. `validateProductFile` rejects `file.size < 1` before upload reservation.

## RED evidence

- Focused RED command: `npm.cmd test -- tests/commerce-validation.test.ts tests/commerce-repository.test.ts tests/commerce-admin.test.tsx tests/commerce-project-security-contract.test.ts --pool=threads --maxWorkers=1`
- Result: 4 files; 83 tests; 12 failed / 71 passed.
  - F1 deletion ordering/concurrency/result semantics: 3 failures.
  - F2 repository project RPC + missing migration contracts: 5 failures.
  - F3 repository/admin UI refund contracts: 3 failures.
  - F4 zero-byte validation: 1 failure.
- Documentation RED command: `npm.cmd test -- tests/deployment-contract.test.ts --pool=threads --maxWorkers=1`
- Result: 1 failed / 3 passed because the new migration/RPC and corrected deletion/refund operations were not documented.

## GREEN evidence

- Extended focused contracts: 5 files, 89/89 passed.
- Full Vitest: 14 files, 237/237 passed.
- Edge Node fallback: 65/65 passed across `analyze-commerce`, `commerce-upload`, and `cleanup-commerce-assets`.
- Strict TypeScript: `npx.cmd tsc -b --pretty false` passed.
- Production build: passed; only the pre-existing `MusicPage` 527.28 kB chunk warning remains.
- `git diff --check`: passed.
- Credential scan: no live OpenAI/Supabase secret, private key, cleanup secret assignment, or privileged `VITE_` variable in the implementation diff.

## Remaining release gates

No remote project was linked or mutated; no migration/function was deployed; no Secret, workflow, or Pages release was written or triggered.

The following remain mandatory external gates because native Deno, PostgreSQL/psql, Supabase CLI, and a disposable remote environment are unavailable here:

- Apply all migrations in order on disposable Supabase/PostgreSQL and verify syntax, owner/grants/RLS, project create/update validation, direct table-write denial, project/generation/delete fences, and manual-vs-automatic concurrent refund convergence.
- Run native Deno check/serve/bundle with static WASM, real JPEG/PNG/WebP decode, Blob MIME propagation, provider timeout, and Edge runtime initialization.
- Exercise real private Storage reserve/signed upload/finalize/remove, post-delete orphan recovery, forged metadata, cross-user denial, seventh-image concurrency, and response-loss retry.
- Exercise cleanup pagination/takeover/lease recovery, OAuth/CORS, GitHub Variables/Secrets/workflow, and desktop/390 px Pages smoke tests.

Until those pass, release status remains **待外部操作门槛**.
