import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type HeavyRouteId = 'ai-commerce' | 'commerce-admin' | 'music' | 'guestbook' | 'tools'
export type HeavyRoutePhase = 'idle' | 'loading' | 'ready' | 'error'

const routeIds = new Set<HeavyRouteId>(['ai-commerce', 'commerce-admin', 'music', 'guestbook', 'tools'])
const phases = new Map<HeavyRouteId, HeavyRoutePhase>()
const listeners = new Map<HeavyRouteId, Set<() => void>>()

export const isHeavyRouteId = (value: string): value is HeavyRouteId => routeIds.has(value as HeavyRouteId)
export const getHeavyRoutePhase = (route: HeavyRouteId) => phases.get(route) ?? 'idle'
export const subscribeHeavyRoute = (route: HeavyRouteId, listener: () => void) => {
  const routeListeners = listeners.get(route) ?? new Set<() => void>()
  routeListeners.add(listener)
  listeners.set(route, routeListeners)
  return () => {
    routeListeners.delete(listener)
    if (routeListeners.size === 0) listeners.delete(route)
  }
}

/** @internal Test-only; never call from runtime code. */
export const resetHeavyRouteLoadingForTests = () => {
  phases.clear()
  listeners.clear()
}

const setPhase = (route: HeavyRouteId, phase: HeavyRoutePhase) => {
  phases.set(route, phase)
  listeners.get(route)?.forEach((listener) => listener())
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

export function createHeavyLazyRoute<T extends ComponentType>(
  route: HeavyRouteId,
  loader: () => Promise<{ default: T }>,
  minimumMs = 900,
): LazyExoticComponent<T> {
  return lazy(async () => {
    setPhase(route, 'loading')
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const startedAt = Date.now()
    try {
      const module = await loader()
      const remainingMs = reduced ? 0 : Math.max(0, minimumMs - (Date.now() - startedAt))
      if (remainingMs > 0) await wait(remainingMs)
      setPhase(route, 'ready')
      return module
    } catch (error) {
      setPhase(route, 'error')
      throw error
    }
  })
}
