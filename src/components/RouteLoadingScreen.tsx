import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getHeavyRoutePhase, subscribeHeavyRoute, type HeavyRouteId } from '../lib/heavyRouteLoading'
import { useMotionProfile } from '../lib/useMotionProfile'
import { ParticleText } from './ParticleText/ParticleText'
import './route-loading-screen.css'

const routeCopy: Record<HeavyRouteId, { label: string; announcement: string }> = {
  'ai-commerce': { label: 'OPENING COMMERCE LAB', announcement: '正在打开 AI 电商实验室' },
  'commerce-admin': { label: 'OPENING OPERATOR CONSOLE', announcement: '正在打开运营控制台' },
  music: { label: 'LOADING AUDIO FIELD', announcement: '正在载入音乐空间' },
  guestbook: { label: 'CONNECTING OPEN CHANNEL', announcement: '正在连接留言频道' },
  tools: { label: 'OPENING TOOL INDEX', announcement: '正在打开工具导航' },
}

export function RouteLoadingScreen({ route }: { route: HeavyRouteId | null }) {
  const { reducedMotion, pageVisible } = useMotionProfile()
  const rootRef = useRef<HTMLDivElement>(null)
  const subscribe = useCallback(
    (listener: () => void) => route ? subscribeHeavyRoute(route, listener) : () => undefined,
    [route],
  )
  const getSnapshot = useCallback(
    () => route ? getHeavyRoutePhase(route) : 'ready' as const,
    [route],
  )
  const phase = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => 'ready',
  )
  const resolved = phase === 'ready' || phase === 'error'
  const [exitComplete, setExitComplete] = useState(() => resolved)
  const leaving = resolved && !exitComplete
  const visible = !resolved || leaving

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setExitComplete(true), reducedMotion ? 120 : 360)
    return () => window.clearTimeout(timer)
  }, [leaving, reducedMotion])

  useLayoutEffect(() => {
    if (!visible) return
    const root = rootRef.current
    const shell = root?.parentElement
    if (!root || !shell) return
    const previous = new Map<HTMLElement, boolean>()
    const makeInert = (node: Node) => {
      if (!(node instanceof HTMLElement) || node === root) return
      if (!previous.has(node)) previous.set(node, node.hasAttribute('inert'))
      node.setAttribute('inert', '')
    }
    Array.from(shell.children).forEach(makeInert)
    const observer = typeof MutationObserver === 'function' ? new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(makeInert))
    }) : null
    observer?.observe(shell, { childList: true })
    return () => {
      observer?.disconnect()
      previous.forEach((wasInert, element) => {
        if (!wasInert) element.removeAttribute('inert')
      })
    }
  }, [visible])

  if (!route || !visible) return null
  const copy = routeCopy[route]
  return <div ref={rootRef} className={`route-loading-screen${leaving ? ' is-leaving' : ''}${reducedMotion ? ' is-reduced-motion' : ''}${pageVisible ? '' : ' is-page-hidden'}`} role="status" aria-live="polite" aria-label={copy.announcement}>
    <div className="route-loading-waves" aria-hidden="true" />
    <div className="route-loading-content">
      <ParticleText text="WENHAO" className="route-loading-wordmark" />
      <p>{copy.label}</p>
      <span className="route-loading-track" aria-hidden="true"><i /></span>
    </div>
  </div>
}
