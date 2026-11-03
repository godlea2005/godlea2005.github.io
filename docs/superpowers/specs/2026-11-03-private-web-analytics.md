# Private Cloudflare website statistics

Approved direction: the owner views analytics in their Cloudflare dashboard; no public counters or new analytics dashboard on the site. The user supplied the exact Cloudflare JS snippet/site token and requested local integration before a separate publishing request.

- Load the official `https://static.cloudflareinsights.com/beacon.min.js` module with the supplied public beacon token, only in a production build on HTTPS `geniusli.cn`. No DNS/server/database changes or new dependencies.
- Development, localhost previews and alternate hosts do not load or report analytics. Avoid duplicate scripts on repeated initialization. Do not load on OAuth callback URLs containing auth/code/state/token material.
- Do not supply user IDs, nickname/email, message/upload content, search query, custom events or server/API credentials to analytics. The beacon site token is public configuration, not a Cloudflare API credential. Dashboard access remains controlled by the user's Cloudflare account.
- Statistics begin after actual authorized publication, not retroactively. Blockers/network failures can reduce counts. This hash-routed SPA needs later production verification for route-level breakdown; this task does not invent per-hash tracking APIs or claim detailed page counters work.
- Local only: no push/publication, account settings, backend changes or edits to `output/`.

Acceptance: exact module/token attributes; one script max; correct host/build/HTTPS guard; callback exclusion; no public dashboard; tests/build pass. Production collection cannot be verified while publication is unauthorized.
