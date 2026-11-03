import { useState } from 'react'
import { safeAvatarUrl } from './avatar'

export function GuestAvatar({ name, url }: { name: string; url?: string }) {
  const src = safeAvatarUrl(url)
  const [failed, setFailed] = useState<string>()
  return src && src !== failed
    ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(src)} />
    : <>{name.replace(/\s/g, '').slice(0,2).toUpperCase() || '?'}</>
}
