import { useEffect, useRef } from 'react'
import { navigationGroups, type NavigationGroup } from '../content/navigation'
import { isRouteCurrent, parseSiteRoute } from '../lib/siteRoutes'
import './card-nav.css'

export type CardNavProps = {
  groups: readonly NavigationGroup[]
  currentHash: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: () => void
}

export function CardNav({ groups = navigationGroups, currentHash, open, onOpenChange, onNavigate }: CardNavProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const handleNavigate = () => {
    triggerRef.current?.focus()
    onNavigate()
  }
  const currentGroup = groups.find((group) => group.destinations.some((destination) => isRouteCurrent(parseSiteRoute(currentHash), destination.href)))

  useEffect(() => {
    const outsidePointer = (event: PointerEvent) => {
      if (open && !rootRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !open) return
      onOpenChange(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', outsidePointer)
    window.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outsidePointer)
      window.removeEventListener('keydown', escape)
    }
  }, [onOpenChange, open])

  return <div className="card-nav-wrap" ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className="card-nav-trigger"
      aria-label={open ? '关闭导航' : '打开导航'}
      aria-expanded={open}
      aria-controls="card-navigation"
      onClick={() => onOpenChange(!open)}
    >
      <span className="card-nav-current">{currentGroup?.title ?? '首页'}</span>
      <span className="card-nav-trigger-label">{open ? '关闭导航' : '打开导航'}</span>
      <span className="card-nav-trigger-mark" aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    <nav
      id="card-navigation"
      className={`card-nav${open ? ' is-expanded' : ''}`}
      aria-label="主导航"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="card-nav-grid">
        {groups.map((group) => <section className="card-nav-card" key={group.id} aria-labelledby={`card-nav-${group.id}`}>
          <div className="card-nav-card-heading">
            <span className="card-nav-index">{group.index}</span>
            <h2 id={`card-nav-${group.id}`}>{group.title}</h2>
          </div>
          <ul>
            {group.destinations.map((destination, destinationIndex) => {
              const current = isRouteCurrent(parseSiteRoute(currentHash), destination.href)
              return <li key={destination.href}>
                <a
                  href={destination.href}
                  aria-label={destination.title}
                  className={current ? 'is-current' : undefined}
                  aria-current={current ? 'page' : undefined}
                  data-target-cursor=""
                  onClick={handleNavigate}
                >
                  <span className="card-nav-destination-index">0{destinationIndex + 1}</span>
                  <span className="card-nav-destination-copy"><strong>{destination.title}</strong><small>{destination.detail}</small></span>
                  <span className="card-nav-arrow" aria-hidden="true">↗</span>
                </a>
              </li>
            })}
          </ul>
        </section>)}
      </div>
    </nav>
  </div>
}
