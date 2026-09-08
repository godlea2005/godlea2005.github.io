Status: ready for root integration review; no commit created.

Implemented the reducer-backed commerce run boundary in `useCommerceRun`, with one synchronous attempt lock, idempotency reuse, scoped user/generation guards, poll cleanup, and non-retriable poll warnings.
`CommerceStudioPage` now owns presentation only; the hook owns submission, cleanup, history result selection, direction reruns, and forced account recovery.
`CommerceRunPanel` derives every primary action from `deriveRunPresentation`, so recoverable, auth, terminal, and progress states cannot expose the ordinary submit/ready UI.
Upload failure clears the tracked project and refreshes history after successful cleanup; cleanup failure stops blind retransmission.
Auth recovery calls `requireLogin('#ai-commerce', { force: true })`; token refreshes are not treated as account changes.
Returning from a selected historical result now resumes an active run without resetting it.

Tests: `npm.cmd test -- tests/commerce-run-machine.test.ts tests/commerce-form.test.tsx` (37 passed).
Tests: `npm.cmd test` (277 passed after final fixes).
Build: `npm.cmd run build` passed after final fixes.
Concern: production build retains the pre-existing Vite large-chunk warnings only.

## Fix round 1 — authentication recovery review

Status: complete.

Commit: `96c93b9` (`fix: secure commerce auth recovery`).

Changes:

- Added a 10-minute, versioned `sessionStorage` OAuth draft schema with `ownerId`, `expiresAt`, a strict text-field allowlist, optional pending-cleanup project ID, and one-time same-user consumption. Files, encoded image data, and credential fields are never serialized; expired and cross-user payloads are cleared.
- Wired the form's latest text snapshot into the run hook so authentication failures before project creation still preserve current text. Returning users receive an empty file list and the notice “文字资料已恢复，请重新选择本地图片。”
- Kept material edits inside `auth-recovery`; image selection/removal and consent are locked there, and the only primary action remains “重新连接账号”.
- When upload cleanup fails with `AUTH_REQUIRED`, the cleanup error now wins classification. The pending project survives the OAuth round trip, is deleted before inputs unlock, then clears the project ID and refreshes open history before a new upload can start.
- Restored the public optional `status`, `progress`, and `error` form props with legacy-to-run-state normalization. Locked step buttons now use native `disabled` semantics.
- Replaced the mobile music dock's fixed 82px commerce offset with viewport visibility tracking for the enabled sticky action; the 44px launcher keeps a 12px gap and has a stronger keyboard focus ring.

Verification:

- `npm.cmd test -- tests/commerce-auth-draft.test.ts tests/commerce-run-machine.test.ts tests/commerce-form.test.tsx tests/music-dock.test.tsx` — 4 files, 50 tests passed.
- `npm.cmd test` — 19 files, 290 tests passed.
- `npm.cmd run build` — passed; only the pre-existing Vite large-chunk warnings remain.

## Fix round 2 — scoped re-review

Status: complete.

Commit: `824dc85` (`fix: block unresolved commerce auth retries`).

Changes:

- Added a hook-level `auth-recovery` guard so direct or stale `submit` calls cannot invoke any repository mutation while reconnection is unresolved.
- Added a form-level phase guard so synthetic/native form submission is accepted only in `editing`; the reconnect action remains the sole visible action.
- Made mobile music clearance an applied, exported 78px constant. This explicitly covers the 54px sticky action, 12px bottom inset, and at least 12px inter-control spacing, while still applying only when the action is visible and enabled.

Verification:

- `npm.cmd test -- tests/commerce-form.test.tsx tests/music-dock.test.tsx` — 2 files, 38 tests passed.
- `npm.cmd test` — 19 files, 292 tests passed.
- `npm.cmd run build` — passed; only the pre-existing Vite large-chunk warnings remain.
