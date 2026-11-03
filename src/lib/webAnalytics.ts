const scriptId = 'cloudflare-web-analytics'
// Public beacon configuration supplied by the site owner, not an API credential.
const beaconToken = 'd607fc712ff24374901fa73b3d68c0ad'
const callbackKeys = new Set([
  'auth', 'code', 'state', 'access_token', 'refresh_token', 'id_token', 'token',
  'sb_flow_id', 'error', 'error_code', 'error_description', 'token_type', 'expires_in',
])

export function shouldLoadWebAnalytics(production: boolean, url: URL): boolean {
  if (!production || url.protocol !== 'https:' || url.hostname !== 'geniusli.cn') return false
  const fragment = url.hash.slice(1)
  const fragmentQuery = fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment.replace(/^\//, '')
  return [url.searchParams, new URLSearchParams(fragmentQuery)].every(params =>
    Array.from(params.keys()).every(key => !callbackKeys.has(key.toLowerCase())),
  )
}

export function installWebAnalytics(options: {
  production?: boolean; url?: URL; document?: Document
} = {}): HTMLScriptElement | null {
  const production = options.production ?? import.meta.env.PROD
  const url = options.url ?? new URL(window.location.href)
  if (!shouldLoadWebAnalytics(production, url)) return null
  const doc = options.document ?? document
  const existing = doc.getElementById(scriptId)
  if (existing) return existing.tagName === 'SCRIPT' ? existing as HTMLScriptElement : null
  if (!doc.body) return null
  const script = doc.createElement('script')
  script.id = scriptId
  script.type = 'module'
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.dataset.cfBeacon = JSON.stringify({ token: beaconToken })
  doc.body.append(script)
  return script
}
