# Final fix wave report

Date: 2026-09-10
Base: `7910e6c`
Implementation commit: `aa58cf5` (`fix: close commerce final review findings`)

## Findings closed

1. **Generation-start authentication cleanup**
   - `useCommerceRun` now detects the exact unsafe boundary where a project exists, asset upload completed, generation was not accepted, and `startGeneration` reports `AUTH_REQUIRED`.
   - The attempt becomes retry-blocked and its project ID is saved in the existing versioned, expiring, text-only OAuth draft. No `File`, file name, image bytes/base64, access token, or refresh token is serialized.
   - A same-user return consumes the draft once, locks the form, deletes the pending project, refreshes history, and only then unlocks file selection and submission. Cleanup failures retain both the input lock and a refresh-recoverable text draft. Existing cross-user draft rejection remains intact.
   - The sequence regression covers upload success → generation-start auth failure → forced OAuth draft → same-user return → pending delete/history refresh → new file selection/upload/start. No second upload or start is possible before delete completion.

2. **Measured commerce/music separation**
   - Every visible primary action emitted by `CommerceRunPanel` now carries `data-commerce-primary-action`.
   - `GlobalMusicDock` reads the active action and launcher through `getBoundingClientRect`, resolves a viewport-safe above/below placement with a 12px gap when their horizontal ranges overlap, and falls back to a viewport-safe horizontal side when vertical placement is unavailable.
   - Measurements update on captured scroll, window resize, DOM state replacement, and `ResizeObserver` size changes. Placement applies only to the 44px launcher, without moving the music popover or using the former fixed 78px offset.
   - Tests use the reported 600px rectangle (`CTA bottom 703.984`, launcher top 710) and a separate 640px rectangle, calculate the final geometry, and assert the resulting vertical gap is 12px. A component test proves the dock reads element rectangles and applies the calculated shift.

3. **Direct Edge Function transport classification**
   - Structured `response.error` values still use response-body parsing.
   - Directly thrown SDK transport errors retain their original class when passed to `mapCommerceError`; a thrown `FunctionsFetchError` now maps to `NETWORK`, invokes once, never refreshes the session, and never replays the write.

4. **Floating navigation toggle and focus**
   - Clicking an already-expanded desktop group toggles it closed.
   - Escape from a desktop dropdown restores the matching group trigger.
   - Escape from the mobile navigation restores the same button after its label returns from “关闭” to “目录”, including when a nested group was open.

5. **Invalid completed-result recovery**
   - A completed generation with invalid result data or a failed persisted-result read derives `recover-result`, not a phantom `view-result` action.
   - The UI renders only “方案暂时不可用” plus the concrete “返回修改资料” action. It never co-renders “结果已安全写入，可进入方案页查看。” and exposes exactly one marked primary action.

## Verification

- `npm.cmd test -- tests/commerce-session.test.ts tests/commerce-run-machine.test.ts tests/music-dock.test.tsx --reporter=verbose` — 3 files, 27 tests passed.
- `npm.cmd test -- tests/commerce-form.test.tsx --reporter=dot` — 1 file, 38 tests passed.
- `npm.cmd test -- tests/commerce-result.test.tsx tests/commerce-run-machine.test.ts --reporter=dot` — 2 files, 37 tests passed.
- `npm.cmd test -- tests/music-dock.test.tsx tests/commerce-form.test.tsx tests/commerce-admin.test.tsx --reporter=dot` — 3 files, 62 tests passed.
- `npm.cmd test` — 19 files, 300 tests passed.
- `npm.cmd run build` — passed (`tsc -b` and Vite production build).
- `git diff --check` — passed; only repository line-ending notices were emitted.

## Constraint audit

- Authentication replay remains limited to one refresh and one replay, only for a structured authentication rejection.
- Generation start is not replayed by this hook, so no second credit charge is introduced.
- User, generation sequence, mount, and OAuth draft owner guards remain enforced.
- OAuth storage remains text-only and expiring; no credentials or image payloads are persisted.
- Existing public form props remain compatible. The former exported 78px music constant is retained as deprecated import compatibility but is no longer applied to layout.
- Launcher placement is viewport-bounded and does not add document width, preserving the mobile overflow contract.

## Concerns

- Production OAuth and authenticated generation smoke tests were not run; this wave verifies those boundaries with repository/auth mocks only.
- The production build retains the pre-existing warnings for chunks larger than 500 kB.
