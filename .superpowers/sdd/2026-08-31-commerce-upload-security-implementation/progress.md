# SDD ledger — plan: docs/superpowers/plans/2026-08-31-commerce-upload-security-implementation.md

Workspace: D:/wendang/ChatGPT/个人网站/.worktrees/codex-ai-commerce-studio
Branch: codex/ai-commerce-studio
Baseline: 2a5bb18
Spec: docs/superpowers/specs/2026-08-31-commerce-upload-security-design.md
Baseline verification: prior whole-branch review found 1 Critical / 2 Important; 186/186 tests and build passed, but merge was blocked by upload authority, terminal-asset recovery and provider deadline gaps.

## Preflight scan

| Tasks / interface | Producer → consumer | Finding / ruling |
|---|---|---|
| Task 1 self | forward migration → grants/RLS/RPC/atomic terminal state | Consistent. It must preserve existing RPC signatures for generation completion/failure and add only forward-compatible functions. |
| Task 2 self | upload runtime → Edge entry/config/docs | Consistent. Pure runtime owns validation; entry point only bootstraps exact static dependencies. |
| Task 3 self | repository → `commerce-upload` + signed Storage upload | Consistent. Public `uploadAssets` signature remains unchanged for the UI. |
| Task 4 self | provider deadline + cleanup reconciliation → schedule | Consistent after terminal restoration ownership ruling below. |
| Task 5 self | completed implementation → operations/release gates | Consistent. It documents, but does not execute, remote actions. |
| Tasks 1 → 2 | reserve/finalize/fail RPCs → upload gateway | Exact RPC names/signatures match. `reserve_commerce_asset` may be invoked with a user client; finalize/fail require service role. |
| Tasks 1 → 4 | reconciliation/listing RPCs → cleanup adapter/runtime | Exact names match. Task 4 must page by the cursor contract implemented by Task 1. |
| Tasks 1 → 3 | removal of direct asset writes → repository | Task 3 removes the browser writes after Task 1 defines the new authority; intermediate commits are not deployable independently and remain on one feature branch. |
| Tasks 2 → 3 | `reserve` / `finalize` actions → repository | Exact request/response shapes match; path and token are outputs only, never caller inputs. |
| Tasks 2 → 4 | failed/abandoned uploads → cleanup | Upload validation failures use the Task 1 fail RPC; cleanup handles removal failure and abandoned rows. |
| Tasks 1/2/3/4 → 5 | migration/function/workflow behavior → operations docs | Exact migration/function names and 60-second/15-minute values agree. |
| Tasks 3 and 4 | no shared file | Both depend on Task 2/1 but do not compete for ownership. |

Ruling: The authenticated `reserve_commerce_asset` RPC may be called directly by a modified client because it creates only a bounded, owned database reservation and never grants an upload token; only `commerce-upload` with a validated session and service client can sign the server-generated path — this keeps auth semantics in PostgreSQL while preventing global Storage consumption — if wrong, a user could self-fill six reservation slots and would need to delete/recreate the project, but cannot create untracked bucket bytes.

Ruling: Once Task 1 makes complete/fail generation restore assets in the same transaction, Task 4 removes the background runtime's separate best-effort terminal `restoreAssets` call; stale cleanup remains only for crashes before a terminal RPC and reconciliation repairs legacy rows — this establishes one authoritative state transition — if wrong, a missed legacy edge case may rely on the redundant RPC and require restoring a guarded compatibility call.

Ruling: The bundled SDD shell scripts could not run because WSL is unavailable on this Windows host; equivalent PowerShell helpers stored in this plan workspace will generate briefs and review packages without changing task semantics — this preserves the artifact workflow — if wrong, review packages could omit a commit, so every helper verifies explicit base/head SHAs and records commit counts.

Task 1 review: spec/quality ❌. Critical: `finalize_commerce_asset_upload` used unqualified predicates that conflicted with `RETURNS TABLE` OUT names under PostgreSQL's default `plpgsql.variable_conflict=error`. Important: static coverage missed the executable SQL ambiguity.

Task 1: fix round 1/5 (2 addressed, 0 open — qualified finalize UPDATE alias plus exact OUT-name regression contract; commits 1225a73..f8613b5)

Task 1: complete (commits 2a5bb18..f8613b5; scoped independent re-review APPROVED, 0 Critical / 0 Important; focused 10/10, full 192/192 and build clean; real PostgreSQL/Supabase migration execution remains an external gate)

Task 2 review: spec/quality ❌. 0 Critical / 3 Important: shallow image inspection and ignored Blob MIME; terminal failed row after Storage removal failure; concurrent finalize could produce ready row with a deleted object.

Task 2: fix round 1/5 (2 addressed, 2 open — attempt-bound validating CAS resolved removal retry and concurrent finalize; trusted decode remained incomplete and abandoned validating claims lacked takeover; commits 962abcc..44229b8)

Task 2: fix round 2/5 (2 addressed, 0 open — pinned real JPEG/PNG/WebP decode with 16MP budget plus service-only row-locking abandoned-claim takeover; commits 44229b8..0846e34)

Task 2: complete (commits f8613b5..0846e34; final scoped independent re-review APPROVED, 0 Critical / 0 Important / 0 Minor; focused 31/31, full 213/213, strict TypeScript and build clean; native Deno/Supabase bundle plus live PostgreSQL/Storage behavior remain staging gates)

Task 3 review: spec/quality ❌. 0 Critical / 2 Important: returned `StorageUnknownError` needed same-reservation finalize reconciliation, and finalize retries were too broad for deterministic HTTP/contract failures.

Task 3: fix round 1/5 (2 addressed, 0 open — ambiguous Storage results reconcile the existing reservation; retries are limited to fetch/relay/raw transport errors; deterministic failures remain single-shot)

Task 3: complete (commit 202eda1; independent scoped re-review APPROVED with no remaining reviewed-scope issue; focused 54/54, full 219/219 and build clean; real SDK error shapes and signed-upload convergence remain staging gates)

Task 4: started at base 202eda1813a39d7aeb3b3a06f9d9e44968976649; implementing deterministic provider deadline, atomic terminal restoration ownership, and bounded cleanup reconciliation via strict RED→GREEN.

Task 4: complete (required subject `fix: recover commerce background failures`; strict RED captured 6 analyze / 5 cleanup / 1 workflow-contract failures; focused Node 25/25 + 22/22, focused Vitest 57/57, full 227/227, strict Edge TypeScript and build clean; native Deno/Postgres/Storage integration remains an explicit external gate)

Task 4 review: independent spec/quality APPROVED (0 Critical / 0 Important / 0 Minor; Node 47/47, focused Vitest 57/57, strict TypeScript and diff-check clean; real Deno/PostgreSQL/Storage remains a deployment gate)

Task 5 review: first independent pass found 0 Critical / 2 Important deployment-contract coverage gaps (direct-orphan/forged-metadata/atomic-terminal assertions and timeout/workflow safeguard assertions).

Task 5: fix round 1/5 (2 addressed, 0 open — deployment tests now bind exact implementation and fail-closed documentation requirements)

Task 5: complete (commit 3688254; scoped independent re-review APPROVED, 0 Critical / 0 Important / 0 Minor; deployment contract 4/4, full 228/228, build and security scans clean; all live Deno/PostgreSQL/Storage/OAuth/Pages checks remain explicit external gates)

Final branch fix: started from `11acf8b` for the final review's 3 Important + 1 Minor only. RED focused run: 4 files / 83 tests, 12 failed and 71 passed (delete race 3, project validation/repository 5, manual refund repository/UI 3, empty file 1). Documentation RED: 1 failed / 3 passed because the new migration/RPCs and corrected deletion/refund contracts were absent.

Final branch fix: GREEN implementation adds append-only `202609030001_commerce_project_validation.sql`, authoritative delete-before-Storage ordering, validated create/update/locked RPCs, idempotent admin manual refund with UI, and zero-byte client validation. Focused contracts pass 89/89; full Vitest passes 237/237 across 14 files; Edge Node fallback passes 65/65; strict TypeScript and production build pass with only the pre-existing MusicPage chunk warning. Secret scan is clean across all 15 changed/untracked files. Native Deno/PostgreSQL/Supabase/Storage/OAuth/Pages verification remains an external release gate.
