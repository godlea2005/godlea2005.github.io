# Private web analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the supplied Cloudflare beacon for owner-only dashboard statistics without counting development traffic.

**Architecture:** A small policy and loader module guards a one-time script insertion, called from the existing bootstrap after rendering. Unit tests exercise production/host/callback cases without requesting the vendor script.

**Tech Stack:** Existing TypeScript/Vite, DOM APIs, Vitest JSDOM; no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-private-web-analytics.md`

## Global Constraints

- Local only: no push/publication, account settings, backend changes or edits to `output/`.
- Development, localhost previews and alternate hosts do not load or report analytics.
- Do not supply personal data, custom events or API credentials to analytics.

### Task 1: Guarded beacon integration

**Files:** Create `src/lib/webAnalytics.ts`, `tests/web-analytics.test.ts`; modify `src/main.tsx`.

**Interfaces:** `shouldLoadWebAnalytics(production: boolean, url: URL): boolean`; `installWebAnalytics(options?: { production?: boolean; url?: URL; document?: Document }): HTMLScriptElement | null`. Defaults consume Vite PROD, current browser URL and document. The fixed script ID prevents repeat insertion.

- [x] Write failing tests for HTTPS production host, development/localhost/www exclusion, auth/code/state/token query/hash exclusion, exact token/module/script URL, deduplication and absence of PII attributes:

```ts
expect(shouldLoadWebAnalytics(false, new URL('https://geniusli.cn/'))).toBe(false)
expect(shouldLoadWebAnalytics(true, new URL('https://geniusli.cn/?code=private'))).toBe(false)
const script = installWebAnalytics({ production: true, url: new URL('https://geniusli.cn/') })
expect(script?.type).toBe('module')
expect(installWebAnalytics({ production: true, url: new URL('https://geniusli.cn/') })).toBe(script)
```

- [x] Run `npm.cmd test -- tests/web-analytics.test.ts` and confirm module-missing failure.
- [x] Implement exact-host/HTTPS/production policy and case-insensitive callback parameter guards. Insert only the supplied script token/config; do not add route event listeners or custom reporting. Import/call `installWebAnalytics()` after the existing render in main.
- [x] Run focused tests, then full suite/build/diff check. Inspect built entry contains the public token, while dev behavior excludes insertion.
- [x] Request read-only code review; resolve important issues. Record results and hand off locally without triggering collection or publication.

Self-review: all spec requirements are covered by one bounded loader task. No hosting or UI redesign; user already selected the private Cloudflare approach and supplied its snippet. Continue inline in existing isolated checkout (executing-plans is not installed).

## Verification / handoff

- Full suite: 56 files / 525 tests passed. TypeScript/Vite build and whitespace check passed. Existing Canvas emulation and bundle-size notices remain non-failing.
- Built `index-DOmz9wlt.js` contains the official beacon URL and exact public site token. Four focused policy/DOM tests pass, including development/localhost exclusion and one-script-only behavior. After review, supplemented routed-fragment callback cases and reran all four tests successfully.
- Independent read-only review: no blocking findings. This was local code verification, not an actual Cloudflare collection test; no external analytics request was initiated by QA, no account settings changed, and no production deployment occurred.
- After a separately authorized publication: verify actual script load and initial data in the owner's Cloudflare Web Analytics dashboard. Verify hash-routing behavior before advertising per-route metrics. Authentication callback page loads are intentionally omitted; a fresh later normal load can initialize analytics.
- No commit/push/deploy or backend changes. User-owned `output/` preserved.

## Publication authorized (2026-11-03)

The user explicitly requested “发布” after local handoff. Re-ran all 56 files / 525 tests and production build successfully before release. Official beacon URL returned HTTP 200 and its code supports locating the `data-cf-beacon` script when document.currentScript is unavailable for modules. Publish using the existing GitHub Pages static worktree; no Cloudflare account/DNS or database changes. Preserve user `output/` and old static resources.
