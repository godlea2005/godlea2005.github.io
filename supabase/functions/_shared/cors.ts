const BASE_HEADERS: Record<string, string> = {
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-max-age': '86400',
  vary: 'Origin',
}

export const parseAllowedOrigins = (value: string | undefined): ReadonlySet<string> =>
  new Set(
    (value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => {
        if (!origin || origin === '*') return false
        try {
          return new URL(origin).origin === origin
        } catch {
          return false
        }
      }),
  )

export type CorsDecision = {
  allowed: boolean
  headers: Record<string, string>
}

/** No-Origin requests are allowed for server/tests but never receive a reflected origin. */
export const corsForRequest = (
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): CorsDecision => {
  const origin = request.headers.get('origin')
  if (!origin) return { allowed: true, headers: { ...BASE_HEADERS } }
  if (!allowedOrigins.has(origin)) return { allowed: false, headers: { vary: 'Origin' } }
  return {
    allowed: true,
    headers: { ...BASE_HEADERS, 'access-control-allow-origin': origin },
  }
}
