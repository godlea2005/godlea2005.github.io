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
  const host = logoHost.trim()
  return <LoadableToolLogo key={host} name={name} logoHost={host} categoryId={categoryId} />
}

function LoadableToolLogo({ name, logoHost, categoryId }: ToolLogoProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [active, setActive] = useState(() => typeof IntersectionObserver === 'undefined')
  const imageRef = useRef<HTMLImageElement>(null)
  const timeoutRef = useRef<number | null>(null)
  const initials = useMemo(() => initialsFor(name), [name])
  const clearFallbackTimeout = () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }

  useEffect(() => {
    if (!logoHost || active || !imageRef.current) return
    // Native lazy images may remain unrequested indefinitely offscreen. Activate
    // at the viewport, so the deadline measures an attempted load, not DOM age.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setActive(true)
        observer.disconnect()
      }
    })
    observer.observe(imageRef.current)
    return () => observer.disconnect()
  }, [logoHost, active])

  useEffect(() => {
    if (!logoHost || !active || loaded || failed) return
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      setFailed(true)
    }, 5000)
    return clearFallbackTimeout
  }, [logoHost, active, loaded, failed])

  if (failed || !logoHost) return <span className="tool-logo-fallback" data-category={categoryId} aria-hidden="true">{initials}</span>
  return <img ref={imageRef} className="tool-logo-image" src={active ? `https://favicon.im/${logoHost}` : undefined} alt="" width="28" height="28"
    loading="lazy" decoding="async" data-loaded={loaded ? 'true' : 'false'}
    onLoad={() => { clearFallbackTimeout(); setLoaded(true) }}
    onError={() => { clearFallbackTimeout(); setFailed(true) }} />
}
