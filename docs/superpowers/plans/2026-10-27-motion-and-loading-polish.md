# Motion and Loading Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a true first-load full-screen transition for heavy routes, restore direct particle-title interaction, make the hero typewriter loop without jumps, and vertically align the existing search/theme capsule.

**Architecture:** Keep all motion event-driven and finite. An eagerly imported route-loading component owns the full-screen transition while a small lazy helper enforces the first-load minimum delay; `ParticleText` owns its own pointer physics and accessible trigger semantics; `TextType` owns a deterministic looping state machine; the header keeps its existing layout and receives CSS-only internal alignment corrections.

**Tech Stack:** React 19, TypeScript, CSS, Canvas 2D, existing OGL Gradient Waves, Vitest, Testing Library, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-10-27-motion-and-loading-polish-design.md`

## Global Constraints

- Heavy-route full-screen loading applies only to first module resolution for `#ai-commerce`, `#commerce-admin`, `#music`, `#guestbook`, and `#tools`; cached revisits must not receive an artificial 900ms delay.
- The loading layer must cover the whole viewport above the header and music dock, and its styles must be eagerly available before a lazy page CSS chunk resolves.
- Normal motion uses an approximately 900ms minimum loading presentation and a 360ms exit; reduced motion removes particle/wave movement and the artificial minimum delay, then uses only a 120ms opacity fade after content resolves.
- `WENHAO` supports local pointer repulsion plus click/Enter/Space burst-and-regroup; stable particles stop requesting frames.
- Coarse pointers get finite formation/tap replay without continuous tracking; reduced motion remains static.
- The three hero phrases loop as type → pause → delete → next; the last phrase deletes to zero before the first phrase restarts.
- The search/theme capsule stays in its current location; only internal vertical alignment changes.
- Preserve 44×44px minimum controls, visible focus, static fallbacks, hidden-page pausing, and complete cleanup of timers/listeners/frames/observers.
- Do not modify authentication, Supabase, guestbook persistence, DeepSeek, uploads, quota, cleanup, database logic, route content, or navigation grouping.
- Add no large animation dependency and no permanent full-screen render loop.
- Leave the user-owned untracked `output/` directory untouched and unstaged.
- Work locally only. Do not push or deploy before explicit user approval.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/lib/heavyRouteLoading.ts` | Heavy-route IDs, lazy module phase registry, first-resolution delay and readiness subscriptions. |
| `src/components/RouteLoadingScreen.tsx` | Eagerly available accessible full-screen overlay, exit phase and route label mapping. |
| `src/components/route-loading-screen.css` | Full-viewport purple/black presentation, progress track, exit/static fallbacks and persistent-control suppression. |
| `src/App.tsx` | Select heavy-route fallback and use delayed lazy wrappers only for the five approved routes. |
| `src/components/ParticleText/ParticleText.tsx` | Finite formation, local pointer repulsion, burst/regroup, accessible trigger and lifecycle cleanup. |
| `src/components/ParticleText/ParticleText.css` | Interactive root/button reset, pointer/focus treatment and static fallback. |
| `src/components/StatusScene.tsx` | Choose fine-pointer versus tap-only title interaction and pass stable hero statements. |
| `src/components/TextType.tsx` | Deterministic optional loop state machine independent of pointer type. |
| `src/components/FloatingHeader.tsx` | Add fixed icon-box classes to the existing search and theme glyph spans without changing DOM order. |
| `src/components/floating-header.css` | Internal control boxes and strict vertical centering without moving the capsule. |
| `tests/route-loading-screen.test.tsx` | Loader labels, timing, caching, reduced-motion and eager-style contracts. |
| `tests/tool-navigation-route.test.tsx` | Eager loading-style and heavy-route source contracts. |
| `tests/particle-text.test.tsx` | Repulsion, burst, keyboard, touch, reduced-motion, visibility and cleanup behavior. |
| `tests/text-type.test.tsx` | Full multi-phrase loops, no final jump, hidden-page pause and reduced-motion static behavior. |
| `tests/homepage-content.test.tsx` | Homepage integration contracts for the interactive title and looping statement. |
| `tests/card-navigation.test.tsx` | Search/theme capsule DOM and 44px alignment contract alongside existing navigation behavior. |
| `tests/cross-page-shell.test.tsx` | Header CSS alignment and responsive source contracts. |
| `docs/project-log.md` | Final local verification record. |

### Task 1: Eager full-screen loading for first heavy-route resolution

**Files:**
- Create: `src/lib/heavyRouteLoading.ts`
- Create: `src/components/RouteLoadingScreen.tsx`
- Create: `src/components/route-loading-screen.css`
- Modify: `src/App.tsx`
- Create: `tests/route-loading-screen.test.tsx`
- Modify: `tests/tool-navigation-route.test.tsx`

**Interfaces:**
- Produces `HeavyRouteId = 'ai-commerce' | 'commerce-admin' | 'music' | 'guestbook' | 'tools'` and `HeavyRoutePhase = 'idle' | 'loading' | 'ready' | 'error'`.
- Produces `createHeavyLazyRoute<T>(route, loader, minimumMs?)`, `getHeavyRoutePhase(route)`, `subscribeHeavyRoute(route, listener)`, `isHeavyRouteId(value)` and the test-only `resetHeavyRouteLoadingForTests()`.
- Produces `<RouteLoadingScreen route={HeavyRouteId | null} />`, which subscribes to the selected module phase and owns its 360ms normal / 120ms reduced-motion leaving state.
- `App` renders the overlay outside Suspense and uses an empty heavy-route Suspense fallback; this lets loaded content mount behind the overlay before it exits.
- Later tasks consume the existing `ParticleText` default non-interactive behavior inside the loader.

- [ ] **Step 1: Write failing loader, exit and caching tests**

Create `tests/route-loading-screen.test.tsx` with a controllable heavy lazy component and fake timers:

```tsx
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHeavyLazyRoute, resetHeavyRouteLoadingForTests } from '../src/lib/heavyRouteLoading'
import { RouteLoadingScreen } from '../src/components/RouteLoadingScreen'

class TestErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() { return this.state.failed ? <p>route failed</p> : this.props.children }
}

afterEach(() => {
  cleanup()
  resetHeavyRouteLoadingForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('heavy route loading', () => {
  it('keeps the first module pending, mounts content behind a 360ms exit, then stays cached', async () => {
    vi.useFakeTimers()
    const loader = vi.fn(async () => ({ default: () => <p>commerce ready</p> }))
    const Page = createHeavyLazyRoute('ai-commerce', loader, 900)
    const renderRoute = () => render(<>
      <RouteLoadingScreen route="ai-commerce" />
      <Suspense fallback={null}><Page /></Suspense>
    </>)
    const view = renderRoute()

    await act(async () => Promise.resolve())
    expect(screen.getByRole('status', { name: '正在打开 AI 电商实验室' })).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(899))
    expect(screen.queryByText('commerce ready')).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByText('commerce ready')).toBeInTheDocument()
    await act(async () => Promise.resolve())
    expect(screen.getByText('commerce ready')).toHaveAttribute('inert')
    expect(screen.getByRole('status')).toHaveClass('is-leaving')
    await act(async () => vi.advanceTimersByTimeAsync(359))
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('commerce ready')).not.toHaveAttribute('inert')

    view.unmount()
    renderRoute()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('commerce ready')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('removes the artificial delay and uses only a 120ms reduced-motion fade', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const Page = createHeavyLazyRoute('music', async () => ({ default: () => <p>ready now</p> }), 900)
    render(<><RouteLoadingScreen route="music" /><Suspense fallback={null}><Page /></Suspense></>)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('ready now')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('is-leaving', 'is-reduced-motion')
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => vi.advanceTimersByTimeAsync(120))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('lets an import failure replace the overlay instead of trapping the page', async () => {
    vi.useFakeTimers()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Page = createHeavyLazyRoute('tools', async () => { throw new Error('chunk failed') }, 900)
    render(<><RouteLoadingScreen route="tools" /><TestErrorBoundary><Suspense fallback={null}><Page /></Suspense></TestErrorBoundary></>)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('route failed')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('is-leaving')
    await act(async () => vi.advanceTimersByTimeAsync(360))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
    errorLog.mockRestore()
  })

  it.each([
    ['ai-commerce', 'OPENING COMMERCE LAB'],
    ['commerce-admin', 'OPENING OPERATOR CONSOLE'],
    ['music', 'LOADING AUDIO FIELD'],
    ['guestbook', 'CONNECTING OPEN CHANNEL'],
    ['tools', 'OPENING TOOL INDEX'],
  ] as const)('announces and labels %s', (route, copy) => {
    render(<RouteLoadingScreen route={route} />)
    expect(screen.getByRole('status')).toHaveTextContent(copy)
    expect(screen.getByText('WENHAO')).toBeInTheDocument()
  })

  it('makes shell siblings inert until the exit completes and restores them on cleanup', () => {
    const view = render(<div className="site-shell"><button>behind</button><RouteLoadingScreen route="guestbook" /></div>)
    expect(screen.getByText('behind')).toHaveAttribute('inert')
    view.rerender(<div className="site-shell"><button>behind</button></div>)
    expect(screen.getByText('behind')).not.toHaveAttribute('inert')
  })

  it('keeps static copy when Canvas 2D is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<RouteLoadingScreen route="commerce-admin" />)
    expect(screen.getByText('WENHAO')).toBeVisible()
    expect(screen.getByText('OPENING OPERATOR CONSOLE')).toBeVisible()
  })

  it('marks hidden-page motion as paused and removes the marker after resume', () => {
    render(<RouteLoadingScreen route="guestbook" />)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByRole('status')).toHaveClass('is-page-hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByRole('status')).not.toHaveClass('is-page-hidden')
  })
})
```

Store and restore the original `document.hidden` descriptor in this test file just as `tests/particle-text.test.tsx` already does. The local `TestErrorBoundary` suppresses only the expected React error log inside that test and exposes its error copy after the overlay exits. The reset function is marked `/** @internal Test-only; never call from runtime code. */`; it exists solely to isolate the module-level phase map in Vitest and must not be imported by `src/`.

Add source-contract assertions proving `route-loading-screen.css` is imported by the eager component, the safe-area padding and `animation-play-state: paused` rules exist, and `App` no longer emits the old plain `<main className="commerce-loading">` fallback.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/route-loading-screen.test.tsx tests/tool-navigation-route.test.tsx
```

Expected: FAIL because the phase registry and route-loading component do not exist and `App` still uses the plain Suspense text fallback.

- [ ] **Step 3: Implement the heavy-route phase registry and lazy wrapper**

Create `src/lib/heavyRouteLoading.ts`:

```ts
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
```

React.lazy caches each returned component after first resolution, so the phase remains `ready` and the loader is not called on cached revisits. Measuring elapsed time and creating the remainder timer only after a successful import preserves the 900ms minimum without leaving a timer behind when import rejects. The wrapper rethrows import errors after publishing `error`; it does not swallow route failures.

- [ ] **Step 4: Implement the eager overlay and explicit leaving phase**

Create `src/components/RouteLoadingScreen.tsx` using stable external-store callbacks and one local exit-completion flag. `ready` and `error` are both resolved phases, so import failures cannot leave the overlay trapped above the error boundary:

```tsx
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
```

In `route-loading-screen.css`, make `.route-loading-screen` `position: fixed; inset: 0; z-index: 1000; min-height: 100svh; box-sizing: border-box; padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); display: grid; place-items: center; overflow: hidden;` with a purple/black radial-plus-linear background. `.is-leaving` transitions opacity and a small translate/scale over 360ms; `.is-reduced-motion.is-leaving` uses only a 120ms linear opacity transition and no transform. Add restrained wave-band and progress-track keyframes plus:

```css
.site-shell:has(.route-loading-screen) .floating-header,
.site-shell:has(.route-loading-screen) .music-dock {
  visibility: hidden;
  pointer-events: none;
}

.route-loading-screen.is-page-hidden .route-loading-waves,
.route-loading-screen.is-page-hidden .route-loading-track i,
.route-loading-screen.is-page-hidden::before {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .route-loading-screen::before,
  .route-loading-waves,
  .route-loading-track i { animation: none; }
  .route-loading-screen { animation: none; transition: opacity 120ms linear; }
  .route-loading-screen.is-leaving { transform: none; }
}
```

The overlay's CSS wave treatment has no JavaScript initializer and therefore falls back to the base gradient automatically. The static `WENHAO` fallback and route label remain readable if Canvas 2D is unavailable. The `inert` lifecycle scans current direct shell siblings, observes `childList` additions for content mounted during the exit phase, disconnects on cleanup, and restores only attributes it added.

- [ ] **Step 5: Wire the overlay outside Suspense and only delay five heavy routes**

In `src/App.tsx`, replace ordinary `lazy` with `createHeavyLazyRoute` only for Music, Guestbook, Commerce Studio, Commerce Admin and Tools. Keep Writing/Article/Work/Project on ordinary `lazy`.

Derive the selected heavy route, render the overlay before Suspense, and keep a lightweight accessible fallback for non-heavy editorial routes:

```tsx
const heavyRoute = route.kind === 'static' && isHeavyRouteId(route.page) ? route.page : null

<RouteLoadingScreen key={heavyRoute ?? 'non-heavy'} route={heavyRoute} />
<Suspense fallback={heavyRoute ? null : <main className="route-loading-inline" role="status" aria-live="polite">载入现场笔记</main>}>
  <RouteScrollBoundary pageHash={pageHash}>
    {musicPage ? <MusicPage /> : guestbookPage ? <GuestbookPage /> : commercePage ? <CommerceStudioPage /> : commerceAdminPage ? <CommerceAdminPage /> : toolsPage ? <ToolNavigationPage /> : route.kind === 'static' && route.page === 'writing' ? <WritingIndexPage /> : route.kind === 'article' ? <ArticlePage slug={route.slug} /> : route.kind === 'static' && route.page === 'work' ? <WorkIndexPage /> : route.kind === 'project' ? <ProjectPage slug={route.slug} /> : <HomePage theme={theme} />}
  </RouteScrollBoundary>
</Suspense>
```

Remove the old plain `commerce-loading`/`music-loading` fallback. Add a small centered `.route-loading-inline` rule to the eagerly imported loader stylesheet for non-heavy editorial routes. Do not change commerce or music business components.

- [ ] **Step 6: Run focused tests and build**

Run:

```powershell
npm.cmd test -- tests/route-loading-screen.test.tsx tests/tool-navigation-route.test.tsx tests/app-scroll.test.tsx
npm.cmd run build
```

Expected: all focused tests PASS; TypeScript and Vite build PASS; existing chunk-size advisories may remain.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/App.tsx src/lib/heavyRouteLoading.ts src/components/RouteLoadingScreen.tsx src/components/route-loading-screen.css tests/route-loading-screen.test.tsx tests/tool-navigation-route.test.tsx
git commit -m "feat: add full-screen route loading"
```

### Task 2: Event-driven interactive `WENHAO` particles

**Files:**
- Modify: `src/components/ParticleText/ParticleText.tsx`
- Modify: `src/components/ParticleText/ParticleText.css`
- Modify: `src/components/StatusScene.tsx`
- Modify: `tests/particle-text.test.tsx`
- Modify: `tests/homepage-content.test.tsx`

**Interfaces:**
- Extends `ParticleTextProps` with `interaction?: 'none' | 'repel-and-burst' | 'tap-burst'` and `burstStrength?: number`.
- Default interaction is `none`, keeping `RouteLoadingScreen` non-interactive.
- `StatusScene` passes `repel-and-burst` for fine hover, `tap-burst` for coarse pointers, and relies on `ParticleText` reduced-motion fallback.
- Every non-reduced-motion mode performs one finite formation, including coarse pointers and the loader's default non-interactive mode; only reduced motion is immediately static.

- [ ] **Step 1: Replace the old “pointer does nothing” assertion with failing interaction tests**

In `tests/particle-text.test.tsx`, import `userEvent`, retain the existing Canvas/RAF harness, and extend its setup options exactly as follows (the rest of the current mocks stay in place):

```ts
type SetupOptions = {
  fine?: boolean
  reduced?: boolean
  sampledParticles?: ReadonlyArray<readonly [number, number]>
  canvasFailure?: 'none' | 'missing-context' | 'sample-error'
  observerThrows?: boolean
}

function setup({ fine = true, reduced = false, sampledParticles = [[0, 0]], canvasFailure = 'none', observerThrows = false }: SetupOptions = {}) {
  // existing matchMedia / RAF / ResizeObserver setup
  // At the start of ResizeMock's constructor:
  // if (observerThrows) throw new Error('observer failed')
  const context = {
    // existing 2D spies
    getImageData: vi.fn((_: number, __: number, width: number, height: number) => {
      if (canvasFailure === 'sample-error') throw new Error('sample failed')
      const data = new Uint8ClampedArray(width * height * 4)
      sampledParticles.forEach(([x, y]) => {
        if (x < width && y < height) data[(y * width + x) * 4 + 3] = 255
      })
      return { data }
    }),
  }
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(canvasFailure === 'missing-context' ? null : context as unknown as CanvasRenderingContext2D)
  // existing flush helper
  return { frames, instances, resize, disconnect, getContext, context, flush }
}
```

Add this exact settling helper:

```ts
const flushUntilSettled = (env: ReturnType<typeof setup>, limit = 160) => {
  for (let frame = 0; frame < limit && env.frames.size; frame += 1) env.flush()
  expect(env.frames.size).toBe(0)
}
```

For the pointer test, mock the title rectangle to `240×80` before rendering and make the harness's `getImageData` expose deterministic particles at `(24, 24)` and `(180, 24)`. Then add:

```tsx
it('wakes settled particles for local pointer repulsion and settles again', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 240, 80))
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const env = setup({ sampledParticles: [[24, 24], [180, 24]] })
  render(<ParticleText text="WENHAO" interaction="repel-and-burst" mouseRadius={88} mouseStrength={0.9} />)
  flushUntilSettled(env)
  const title = screen.getByRole('button', { name: '重新组合 WENHAO 粒子标题' })
  env.context.arc.mockClear()
  vi.mocked(window.requestAnimationFrame).mockClear()
  fireEvent.pointerMove(title, { clientX: 25, clientY: 24 })
  expect(env.frames.size).toBe(1)
  env.flush()
  expect(env.context.arc.mock.calls[0][0]).toBeLessThan(24)
  expect(env.context.arc.mock.calls[1][0]).toBe(180)
  flushUntilSettled(env)
})

it('bursts on click, Enter and Space without stacking an active burst', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 40))
  const user = userEvent.setup()
  const env = setup()
  render(<ParticleText text="WENHAO" interaction="repel-and-burst" />)
  const title = screen.getByRole('button', { name: '重新组合 WENHAO 粒子标题' })
  flushUntilSettled(env)
  fireEvent.click(title)
  fireEvent.click(title)
  expect(env.frames.size).toBe(1)
  flushUntilSettled(env)
  title.focus()
  await user.keyboard('{Enter}')
  expect(env.frames.size).toBe(1)
  flushUntilSettled(env)
  await user.keyboard('[Space]')
  expect(env.frames.size).toBe(1)
  flushUntilSettled(env)
})

it('forms and replays finitely on a coarse pointer without pointer tracking', () => {
  const env = setup({ fine: false, reduced: false })
  render(<ParticleText text="WENHAO" interaction="tap-burst" />)
  expect(screen.getByRole('button').querySelector('canvas')).toBeInTheDocument()
  flushUntilSettled(env)
  fireEvent.pointerMove(screen.getByRole('button'), { clientX: 1, clientY: 0 })
  expect(env.frames.size).toBe(0)
  fireEvent.click(screen.getByRole('button'))
  expect(env.frames.size).toBe(1)
  flushUntilSettled(env)
})

it('uses only the static accessible fallback under reduced motion', () => {
  const env = setup({ fine: false, reduced: true })
  render(<ParticleText text="WENHAO" interaction="tap-burst" />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'WENHAO' }).querySelector('canvas')).not.toBeInTheDocument()
  expect(env.frames.size).toBe(0)
})

it.each([
  { canvasFailure: 'missing-context' as const, observerThrows: false },
  { canvasFailure: 'sample-error' as const, observerThrows: false },
  { canvasFailure: 'none' as const, observerThrows: true },
])('falls back without leaking work after a rendering primitive fails', (options) => {
  const env = setup(options)
  expect(() => render(<ParticleText text="WENHAO" />)).not.toThrow()
  expect(screen.getByRole('img', { name: 'WENHAO' })).toHaveTextContent('WENHAO')
  expect(env.frames.size).toBe(0)
  expect(env.instances).toHaveLength(0)
  expect(document.querySelector('.particle-text')).toHaveClass('is-fallback')
})
```

Replace the old parameterized coarse/reduced static assertion: coarse pointers now receive a finite Canvas formation, while reduced motion alone remains static. Retain the existing hidden-document, resize and unmount cases. The failure table proves `getContext()` returning `null`, `getImageData()` throwing and `new ResizeObserver()` throwing all retain the static accessible title without a queued frame.

- [ ] **Step 2: Run the particle tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/particle-text.test.tsx tests/homepage-content.test.tsx
```

Expected: FAIL because `interaction` does not exist, the component renders a non-interactive span and pointer/click events never disturb settled particles.

- [ ] **Step 3: Implement event-driven repulsion and burst**

Extend the particle record and animation closure without adding a continuous idle loop. Import `useCallback`, destructure the existing `mouseRadius = 88` and `mouseStrength = 0.9` props, add `burstStrength = 1.15`, and use `animated = !reducedMotion`. Set `interactive = interaction !== 'none' && !reducedMotion`. Change the root ref to `useRef<HTMLElement | null>(null)` and assign it through `const setRoot = useCallback((node: HTMLElement | null) => { rootRef.current = node }, [])`, which is accepted by both the button and span branches.

The pointer disturbance follows this shape:

```ts
const disturb = () => {
  calmFrames = 0
  isSettled = false
  setStage('forming')
  start()
}

const repelAt = (clientX: number, clientY: number) => {
  const bounds = root.getBoundingClientRect()
  const pointerX = clientX - bounds.left
  const pointerY = clientY - bounds.top
  let affected = false
  for (const particle of particles) {
    const dx = particle.x - pointerX
    const dy = particle.y - pointerY
    const distance = Math.max(1, Math.hypot(dx, dy))
    if (distance >= mouseRadius) continue
    affected = true
    const force = (1 - distance / mouseRadius) * mouseStrength
    particle.velocityX += (dx / distance) * force * 9
    particle.velocityY += (dy / distance) * force * 9
  }
  if (affected) disturb()
}
```

Maintain a closure-local `burstActive` flag. `burst()` returns while `burstActive || !isSettled`, then adds radial velocity from the title center multiplied by `burstStrength`, sets `burstActive = true`, and calls `disturb()`. The settle branch resets `burstActive = false`. Fine-pointer `repel-and-burst` attaches native `pointermove` and `click`; `tap-burst` attaches only `click`. Browser-generated button clicks provide Enter/Space parity without a separate keydown listener. Remove every attached listener in the layout-effect cleanup and include `interaction`, `fineHover`, `mouseRadius`, `mouseStrength`, and `burstStrength` in its dependencies.

Wrap sampling (`measureText`, `getImageData`) and drawing in guarded helpers. Maintain a closure-local `failed` boolean. On any Canvas exception, set `failed = true`, stop the frame, clear particles, set `canvas.hidden = true`, and set stage `fallback`; after `build()`, return the cleanup immediately when `failed` is true so no observer or native interaction listener is installed. Construct `ResizeObserver` inside `try/catch`: if the API is absent, retain the existing window-resize fallback; if construction or `observe()` throws, disconnect it and call the same static-fallback routine instead of starting another observer or frame. Canvas/context/observer failures must never escape the effect.

When `interaction !== 'none'` and motion is allowed, render the root as:

```tsx
<button ref={setRoot} type="button" className={`particle-text particle-text-trigger is-${stage}${className ? ` ${className}` : ''}`} aria-label={`重新组合 ${text} 粒子标题`}>
  <span className="particle-text-fallback" aria-hidden="true">{text}</span>
  {animated && <canvas ref={canvasRef} aria-hidden="true" />}
</button>
```

When interaction is `none` or reduced motion is active, preserve the same `setRoot`, `is-${stage}`, caller `className`, labelled non-focusable span and static fallback. Canvas animation is allowed on coarse pointers for finite formation; only reduced motion forces static output. The default `none` mode therefore gives the full-screen loader one aggregation but no focus target or pointer listeners.

Use this exact non-interactive branch:

```tsx
<span ref={setRoot} className={`particle-text is-${animated ? stage : 'fallback'}${className ? ` ${className}` : ''}`} role="img" aria-label={text}>
  <span className="particle-text-fallback" aria-hidden="true">{text}</span>
  {animated && <canvas ref={canvasRef} aria-hidden="true" />}
</span>
```

- [ ] **Step 4: Wire the homepage interaction and focus styling**

In `StatusScene.tsx`, pass:

```tsx
<ParticleText
  text={site.englishName}
  colors={theme === 'light' ? lightParticleColors : darkParticleColors}
  interaction={fineHover ? 'repel-and-burst' : 'tap-burst'}
/>
```

Do not gate the whole component on `fineHover`; render `ParticleText` in all modes and let the component make reduced motion static. In `ParticleText.css`, reset button border/background/padding/font, preserve the existing size, add `cursor: pointer` for fine pointers, add an accent `:focus-visible` outline, and ensure `canvas[hidden] { display: none; }`. Do not let the button change the heading’s layout.

- [ ] **Step 5: Run focused tests and build**

Run:

```powershell
npm.cmd test -- tests/particle-text.test.tsx tests/homepage-content.test.tsx tests/homepage-editorial.test.tsx tests/motion-profile.test.tsx
npm.cmd run build
```

Expected: all tests and build PASS; no orphan RAF/timer warning.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/components/ParticleText/ParticleText.tsx src/components/ParticleText/ParticleText.css src/components/StatusScene.tsx tests/particle-text.test.tsx tests/homepage-content.test.tsx
git commit -m "feat: add interactive particle wordmark"
```

### Task 3: Continuous, non-jumping hero typewriter loop

**Files:**
- Modify: `src/components/TextType.tsx`
- Modify: `src/components/StatusScene.tsx`
- Modify: `tests/text-type.test.tsx`
- Modify: `tests/homepage-content.test.tsx`

**Interfaces:**
- Extends `TextTypeProps` with `loop?: boolean`; default remains `false` for reusable one-shot behavior.
- `StatusScene` consumes `<TextType texts={heroStatements} loop />` where `heroStatements` is a module-level readonly tuple.
- Pointer type no longer controls typing; only reduced motion selects static text.

- [ ] **Step 1: Write failing two-cycle and no-jump tests**

In `tests/text-type.test.tsx`, replace the settled-first-phrase expectation for the homepage loop with deterministic fake-timer assertions:

```tsx
const glyphs = (container: HTMLElement) => container.querySelector<HTMLElement>('.text-type-glyphs')!
const runNextStep = () => act(() => { vi.runOnlyPendingTimers() })

it('deletes the final phrase before restarting the first phrase', () => {
  vi.useFakeTimers()
  setMotion(false)
  const view = render(<TextType texts={['第一句', '第二句']} typingMs={10} deletingMs={5} pauseMs={20} loop />)
  const { container } = view
  for (let step = 0; step < 40 && glyphs(container).textContent !== '第二句'; step += 1) runNextStep()
  expect(glyphs(container)).toHaveTextContent('第二句')
  runNextStep() // typing -> pausing
  runNextStep() // pausing -> deleting
  runNextStep()
  expect(glyphs(container)).toHaveTextContent('第二')
  runNextStep()
  expect(glyphs(container)).toHaveTextContent('第')
  runNextStep()
  expect(glyphs(container).textContent).toBe('')
  runNextStep() // select phrase zero at length zero
  expect(glyphs(container).textContent).toBe('')
  runNextStep()
  expect(glyphs(container)).toHaveTextContent('第')
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('continues through two complete loops without accumulating timers', () => {
  vi.useFakeTimers()
  setMotion(false)
  const view = render(<TextType texts={['一', '二']} typingMs={1} deletingMs={1} pauseMs={1} loop />)
  const { container } = view
  const changes: string[] = []
  let previous = ''
  for (let step = 0; step < 21; step += 1) {
    runNextStep()
    const current = glyphs(container).textContent ?? ''
    if (current !== previous) changes.push(current)
    previous = current
  }
  expect(changes).toEqual(['一', '', '二', '', '一', '', '二', '', '一'])
  expect(vi.getTimerCount()).toBe(1)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('types on coarse pointers', () => {
  vi.useFakeTimers()
  setMotion(false, false)
  const view = render(<TextType texts={['第一句', '第二句']} typingMs={1} loop />)
  const { container } = view
  expect(glyphs(container).textContent).toBe('')
  runNextStep()
  expect(glyphs(container)).toHaveTextContent('第')
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
```

Retain and adapt the hidden-document teardown and reduced-motion tests. Keep the existing one-shot test without `loop` and its `runAllTimers()` assertion; never call `runAllTimers()` on a looping instance. After unmounting every loop test, assert `vi.getTimerCount() === 0`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/text-type.test.tsx tests/homepage-content.test.tsx
```

Expected: FAIL because `loop` does not exist, coarse pointers render the first phrase immediately, and the final pause jumps to a settled full first phrase.

- [ ] **Step 3: Implement the loop state transition**

Update the props and state machine. Import `useMemo`, remove unused `fineHover` from the motion profile, and stabilize equivalent input arrays through `textKey`:

```ts
export type TextTypeProps = {
  texts: readonly string[]
  typingMs?: number
  deletingMs?: number
  pauseMs?: number
  loop?: boolean
}

const staticText = reducedMotion
const textKey = JSON.stringify(texts)
const stableTexts = useMemo<readonly string[]>(() => JSON.parse(textKey) as string[], [textKey])

// In pausing:
next = current.phrase === stableTexts.length - 1 && !loop
  ? { phrase: 0, length: Array.from(first).length, phase: 'settled' }
  : { ...current, phase: 'deleting' }

// When deletion reaches zero:
const nextPhrase = current.phrase === stableTexts.length - 1 ? 0 : current.phrase + 1
next = current.length > 0
  ? { ...current, length: current.length - 1 }
  : { phrase: nextPhrase, length: 0, phase: 'typing' }
```

Use `stableTexts` for `first`, current phrase lookup, phrase lengths and empty-list guards. Keep the single-timer recursion, `stepRef`, page-visibility pause and cleanup. The scheduling effect depends on `deletingMs`, `first`, `loop`, `pageVisible`, `pauseMs`, `stableTexts`, `staticText`, `textKey`, and `typingMs`; it must not depend on the caller's original `texts` array identity. A parent rerender with unchanged text content therefore does not restart the timer or reset `step`.

- [ ] **Step 4: Stabilize homepage statements**

Move the three phrases in `StatusScene.tsx` to a module-level constant:

```ts
const heroStatements = [
  '记录设计与技术的现场',
  '把想法做成看得见的作品',
  '在商业与创作之间持续实践',
] as const
```

Render `<TextType texts={heroStatements} loop />`.

- [ ] **Step 5: Run focused tests and build**

Run:

```powershell
npm.cmd test -- tests/text-type.test.tsx tests/homepage-content.test.tsx tests/homepage-editorial.test.tsx tests/motion-profile.test.tsx
npm.cmd run build
```

Expected: all tests and build PASS; fake-timer teardown reports zero leaked timers after unmount.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/components/TextType.tsx src/components/StatusScene.tsx tests/text-type.test.tsx tests/homepage-content.test.tsx
git commit -m "fix: loop hero typewriter smoothly"
```

### Task 4: Vertically align the existing search/theme capsule

**Files:**
- Modify: `src/components/FloatingHeader.tsx`
- Modify: `src/components/floating-header.css`
- Modify: `tests/card-navigation.test.tsx`
- Modify: `tests/cross-page-shell.test.tsx`

**Interfaces:**
- Keeps `FloatingHeader` props and DOM order unchanged.
- Keeps `.floating-actions` right-aligned at every current breakpoint.
- Produces fixed icon boxes and a shared 44px internal control height.

- [ ] **Step 1: Write failing alignment-contract tests**

Extend `tests/card-navigation.test.tsx` and the CSS contract in `tests/cross-page-shell.test.tsx`:

```tsx
it('keeps search and theme controls in one vertically centered 44px capsule', () => {
  render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
  const search = screen.getByRole('button', { name: '打开搜索' })
  const theme = screen.getByRole('button', { name: /切换至.+模式/ })
  expect(search.querySelector('[aria-hidden="true"]')).toHaveClass('floating-action-icon')
  expect(theme.querySelector('[aria-hidden="true"]')).toHaveClass('floating-action-icon')
  expect(search.closest('.floating-actions')).toContainElement(theme)
})

it('defines centered fixed boxes without relocating the action capsule', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/floating-header.css'), 'utf8')
  expect(css).toMatch(/\.floating-actions button\s*\{[^}]*height:\s*44px[^}]*display:\s*grid[^}]*place-items:\s*center/s)
  expect(css).toMatch(/\.floating-action-icon\s*\{[^}]*width:\s*24px[^}]*height:\s*24px[^}]*place-items:\s*center/s)
  expect(css).toMatch(/\.floating-actions\s*\{[^}]*justify-self:\s*end/s)
  expect(css).toMatch(/@media \(max-width:\s*1080px\)[\s\S]*?\.floating-search\s*\{[^}]*grid-template-columns:\s*24px[^}]*column-gap:\s*0/s)
})
```

In `FloatingHeader.tsx`, make exactly these two markup edits and do not restructure the header:

```tsx
<span className="floating-action-icon" aria-hidden="true">⌕</span>
<span className="floating-action-icon" aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span>
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/card-navigation.test.tsx tests/cross-page-shell.test.tsx
```

Expected: FAIL because the spans lack fixed icon boxes and buttons rely on font baselines rather than a strict shared 44px grid.

- [ ] **Step 3: Implement the alignment-only CSS change**

Keep the current `.floating-header` grid and `.floating-actions { justify-self: end; }`. Amend only internal layout:

```css
.floating-actions button {
  width: auto;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  padding: 0 10px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  line-height: 1;
}

.floating-search {
  grid-template-columns: 24px auto;
  align-items: center;
  column-gap: 8px;
}

.floating-action-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  line-height: 1;
}

.floating-search kbd {
  align-self: center;
  line-height: 1;
}
```

At the existing `max-width:1080px` breakpoint, the hidden shortcut leaves the search button as a centered 44×44 icon. Do not change the capsule’s right-side position or the Card Nav grid.

Add this exact breakpoint correction so the hidden `kbd` does not leave an empty `auto` track or column gap:

```css
@media (max-width: 1080px) {
  .floating-search {
    grid-template-columns: 24px;
    column-gap: 0;
  }
}
```

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
npm.cmd test -- tests/card-navigation.test.tsx tests/cross-page-shell.test.tsx tests/homepage-editorial.test.tsx
npm.cmd run build
```

Expected: all tests and build PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add src/components/FloatingHeader.tsx src/components/floating-header.css tests/card-navigation.test.tsx tests/cross-page-shell.test.tsx
git commit -m "fix: center header action controls"
```

### Task 5: Full local verification and handoff

**Files:**
- Modify: `docs/project-log.md`

**Interfaces:**
- Consumes the completed behaviors from Tasks 1–4.
- Produces a local verification record only; no source behavior or deployment state changes.

- [ ] **Step 1: Run the combined focused regression suite**

Run:

```powershell
npm.cmd test -- tests/route-loading-screen.test.tsx tests/particle-text.test.tsx tests/text-type.test.tsx tests/card-navigation.test.tsx tests/homepage-content.test.tsx tests/homepage-editorial.test.tsx tests/cross-page-shell.test.tsx tests/app-scroll.test.tsx tests/motion-profile.test.tsx tests/gradient-waves.test.tsx
```

Expected: every file and test PASS with no unhandled rejection, leaked timer or orphan animation-frame warning.

- [ ] **Step 2: Run the complete automated checks**

Run:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check:edge
git diff --check
```

Expected: full suite PASS, Vite build PASS, all three existing Edge entry points PASS, and no whitespace errors. Existing bundle-size warnings may be recorded but do not fail this task.

- [ ] **Step 3: Start a safe local preview**

Start Vite bound to `127.0.0.1` on a free strict port with process-local blank/whitespace `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Do not read or edit `.env*`. Keep the preview disconnected from Supabase and do not exercise login, persistence, generation, uploads, paid APIs or external tool navigation.

- [ ] **Step 4: Verify the full-screen loader in a real browser**

Using Playwright CLI from `%TEMP%\wenhao-motion-loading-qa`:

- Use a fresh browser context and delay the first approved heavy-route JavaScript chunk response.
- Open `#ai-commerce`, `#music`, `#guestbook`, `#tools` and `#commerce-admin` one at a time in fresh contexts.
- Confirm the loading layer rectangle equals the viewport, is above header/music, exposes the correct status copy and remains visible for the normal-motion minimum.
- Tab through the document while the layer is entering and leaving; confirm no header, route or music control behind it can receive focus or pointer input, then confirm the temporary `inert` attributes are restored after exit.
- Return home and revisit the already resolved route in the same context; confirm no artificial 900ms replay.
- Hide the tab during one first load; confirm CSS waves, progress and particle frames pause, then resume or finish cleanly when visible again.
- Repeat one route under reduced motion; confirm static presentation, no artificial minimum delay, and only the 120ms opacity fade with no spatial movement.
- Disable Canvas 2D once and force one particle sampling failure once; confirm the static `WENHAO`, route label and base gradient remain complete with no blocking exception.
- Record screenshots and measurements only under the temporary QA directory, never under `output/`.

- [ ] **Step 5: Verify particle and typewriter behavior**

At 1440×1000 with a fine pointer:

- Move into the `WENHAO` title and confirm only nearby particles displace and return.
- Click, press Enter and press Space; each causes one full burst/regroup cycle and preserves visible keyboard focus.
- After settling, verify no continuing animation-frame activity until the next event.
- Force Canvas context, pixel sampling and ResizeObserver failures in the focused browser/test harness and confirm the static wordmark remains readable with zero orphan frames or uncaught errors.
- Observe two complete typewriter cycles; confirm the final phrase deletes character-by-character before the first phrase restarts from one character.
- Hide/show the page once and confirm the current phrase resumes without duplicate timers.

At 390×844 coarse pointer and under reduced motion, verify finite tap/static fallbacks and readable title/copy.

- [ ] **Step 6: Verify capsule alignment and responsive safety**

At 1440×1000, 1024×900, 768×1024 and 390×844 in both themes:

- Measure search icon, shortcut label and theme icon centers; vertical centers should differ by no more than 1px.
- Confirm the action capsule remains in its original right-side position.
- Confirm every control is at least 44×44px, no clipping and no unexpected horizontal scrolling.
- Check console warnings/errors and page exceptions after loading, title interaction and repeated navigation.

- [ ] **Step 7: Record the local verification**

Append to `docs/project-log.md`:

- implementation commit range;
- focused/full test counts and exact commands;
- build and Edge results;
- loader routes, viewport/theme matrix and measured overlay/control geometry;
- particle/title/typewriter interaction results;
- reduced-motion/coarse-pointer/static fallback results;
- confirmation that `output/`, backend, auth, secrets, remote Git and production were untouched;
- background-focus isolation, hidden-tab pause and Canvas/observer fallback results;
- any remaining bundle warning or intentionally untested live workflow.

- [ ] **Step 8: Commit verification documentation**

```powershell
git add docs/project-log.md
git commit -m "docs: verify motion and loading polish"
```
