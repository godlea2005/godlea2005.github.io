# Guestbook sync and account avatar repair (local)

User requested fixed synchronization feedback and account-derived avatars. No publishing or remote database mutation authorized.

- Refresh keeps a 44px fixed icon during busy state, uses aria-busy/disabled and a distinct accessible busy label, honors reduced motion. Board header items align centrally, avoiding the old three-character label overflowing a 30px circle.
- Composer obtains the signed-in GitHub avatar_url or Google picture from auth metadata; anonymous/removed sessions do not retain that avatar. Message avatars are keyed to each actual author by the backend, never inferred from admin can_manage permissions.
- GuestAvatar accepts only credential-free HTTPS URLs, no referrer, with initials fallback on absence/image error. No account metadata besides avatar URL is returned by the new RPC.
- Local migration `supabase/migrations/202611030001_guestbook_account_avatars.sql` adds a new JSONB RPC alongside the original, using its visibility-filtered rows. Empty search path, authenticated-only execute. It has NOT been run remotely or against a local PostgreSQL instance. Applying it requires explicit database approval; no website publication is included.
- Before migration, the frontend falls back to original RPC only for missing-function PGRST202/42883; older messages continue showing initials. Current identity composer avatars do not require the migration.
- Verification: full suite 55 files / 521 tests passed; production build passed; diff check passed. Includes deferred-promise busy-state test, metadata/url rejection, broken-image/account changes, correct per-row avatar mapping, missing-RPC fallback and permission-error behavior. Independent read-only review found no blockers; SQL was reviewed, not executed.
- Browser local `http://127.0.0.1:5174/#guestbook`: original endpoint fallback loaded messages; actual refresh before/after measured 43.993×43.993px. The real request completed before the browser observation, so busy-state coverage comes from the deferred-promise test rather than claiming a real intermediate frame. Preview was anonymous; no OAuth or message submission performed.
- No push, deploy, production SQL or edits to user-owned `output/`.

## Explicitly approved database application (2026-11-03)

The user subsequently approved applying only the avatar database update (“嗯嗯” in direct response to the single-update approval question). Website publication remains unauthorized.

- Confirmed project `ujwwwqlpwdplulzslgpi`, `wenhao-personal-site`, ACTIVE_HEALTHY. Before application: avatar RPC absent, migration version absent, 28 messages, original list RPC definition MD5 `3c48cc14dcf83d1bc8be92873b9a3343`.
- Used existing Supabase CLI login and `db query --linked --project-ref ... --file scripts/20261103-apply-guestbook-avatars.sql`, not `db push`. This script guards against overwriting an existing avatar RPC or a changed original RPC, applies only the reviewed definition/grants and records `202611030001` in the same transaction.
- A positional multiline SQL attempt did not persist changes; subsequent read-only checks confirmed the avatar RPC still absent. Switched to the explicit SQL file; independent read-back confirmed the function and migration record persisted.
- After application: original RPC MD5 unchanged, message count 28, 28 visible rows, 14 rows with account avatar URLs, and all original returned message fields equal to the original RPC after removing `avatar_url`. New RPC execution is granted to `authenticated`, denied to `anon`, with empty search path.
- No other migrations, message/profile updates, Git pushes or website deployments performed. The earlier “local-only migration” note describes the initial state and is superseded only for this explicitly approved database application.
