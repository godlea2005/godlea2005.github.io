import { useEffect, useLayoutEffect, useRef } from 'react'

type LayoutSnapshot = { grid: DOMRect; cards: Map<Element, DOMRect> }
const duration = 620
const easing = 'cubic-bezier(.22,1,.36,1)'

/** Measure the painted (possibly interrupted) layout before React changes the grid. */
export function useGuideLayout(active: string | null, enabled: boolean) {
  const grid = useRef<HTMLDivElement>(null)
  const snapshot = useRef<LayoutSnapshot | null>(null)
  const animations = useRef<Animation[]>([])
  const cancel = () => {
    animations.current.forEach(animation => animation.cancel())
    animations.current = []
    grid.current?.style.removeProperty('grid-template-rows')
  }
  const capture = () => {
    if (!enabled || !grid.current) { snapshot.current = null; return }
    snapshot.current = {
      grid: grid.current.getBoundingClientRect(),
      cards: new Map(Array.from(grid.current.querySelectorAll('.home-guide-card'), card => [card, card.getBoundingClientRect()])),
    }
  }

  useLayoutEffect(() => {
    const before = snapshot.current
    snapshot.current = null
    cancel()
    const node = grid.current
    if (!enabled || !before || !node || typeof node.animate !== 'function') return
    const after = node.getBoundingClientRect()
    // Width/height animations must not move the grid tracks underneath the translations.
    // Freeze the destination tracks until all four card rectangles have arrived.
    node.style.gridTemplateRows = window.getComputedStyle(node).gridTemplateRows
    before.cards.forEach((old, card) => {
      const next = card.getBoundingClientRect()
      if (!old.width || !next.width) return
      animations.current.push(card.animate([
        { transform: `translate(${(old.left - before.grid.left) - (next.left - after.left)}px,${(old.top - before.grid.top) - (next.top - after.top)}px)`, width: `${old.width}px`, height: `${old.height}px` },
        { transform: 'translate(0,0)', width: `${next.width}px`, height: `${next.height}px` },
      ], { duration, easing }))
    })
    const heightAnimation = node.animate([{ height: `${before.grid.height}px` }, { height: `${after.height}px` }], { duration, easing })
    heightAnimation.onfinish = () => node.style.removeProperty('grid-template-rows')
    animations.current.push(heightAnimation)
    if (active && after.top < 96) node.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [active, enabled])

  useEffect(() => {
    const settle = () => { snapshot.current = null; cancel() }
    window.addEventListener('resize', settle)
    return () => { window.removeEventListener('resize', settle); settle() }
  }, [])
  return { grid, capture }
}
