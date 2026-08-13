import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabaseConfigured = Boolean(projectUrl && publishableKey)

export const supabase = supabaseConfigured
  ? createClient(projectUrl!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        experimental: {
          appendPkceFlowIdToRedirects: true,
        },
      },
    })
  : null

export type SocialProviderStatus = {
  github: boolean
  google: boolean
}

export async function getSocialProviderStatus(): Promise<SocialProviderStatus> {
  if (!projectUrl || !publishableKey) return { github: false, google: false }
  const response = await fetch(`${projectUrl}/auth/v1/settings`, {
    headers: { apikey: publishableKey },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('无法读取登录方式配置')
  const settings = await response.json() as { external?: Partial<SocialProviderStatus> }
  return {
    github: settings.external?.github === true,
    google: settings.external?.google === true,
  }
}
