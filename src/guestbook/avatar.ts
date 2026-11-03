export function safeAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

export function accountAvatar(user: { is_anonymous?: boolean; user_metadata?: Record<string, unknown> } | null): string | undefined {
  if (!user || user.is_anonymous) return undefined
  return safeAvatarUrl(user.user_metadata?.avatar_url) ?? safeAvatarUrl(user.user_metadata?.picture)
}
