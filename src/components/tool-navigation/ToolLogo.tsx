import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolCategoryId } from '../../content/tools'

export type ToolLogoProps = { name: string; logoHost: string; categoryId: ToolCategoryId }

const initialsFor = (name: string) => {
  const normalized = Array.from(name.trim().replace(/[^\p{L}\p{N}]+/gu, ''))
    .join('').toLocaleUpperCase('en-US')
  const initials = Array.from(normalized).slice(0, 2)
  if (initials.length === 0) return 'WH'
  if (initials.length === 1) initials.push(initials[0])
  return initials.join('')
}

export function ToolLogo({ name, logoHost, categoryId }: ToolLogoProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const initials = useMemo(() => initialsFor(name), [name])
  const clearFallbackTimeout = () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
    clearFallbackTimeout()
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      setFailed(true)
    }, 5000)
    return clearFallbackTimeout
  }, [logoHost])

  if (failed) return <span className="tool-logo-fallback" data-category={categoryId} aria-hidden="true">{initials}</span>
  return <img className="tool-logo-image" src={`https://favicon.im/${logoHost}`} alt="" width="28" height="28"
    loading="lazy" decoding="async" data-loaded={loaded ? 'true' : 'false'}
    onLoad={() => { clearFallbackTimeout(); setLoaded(true) }}
    onError={() => { clearFallbackTimeout(); setFailed(true) }} />
}
