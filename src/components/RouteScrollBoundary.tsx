import { useLayoutEffect, type ReactNode } from 'react'
import { parseSiteRoute } from '../lib/siteRoutes'

/** Lives inside Suspense so scrolling follows committed content, including cached routes. */
export function RouteScrollBoundary({ pageHash, children }: { pageHash: string; children: ReactNode }) {
  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const route = parseSiteRoute(pageHash)
      const target = route.kind === 'home' && route.anchor !== 'top'
        ? document.getElementById(route.anchor) : null
      if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' })
      else window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pageHash])

  return children
}
