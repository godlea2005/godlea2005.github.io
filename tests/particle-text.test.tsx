import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParticleText } from '../src/components/ParticleText/ParticleText'

const originalMatchMedia = window.matchMedia
const originalResizeObserver = globalThis.ResizeObserver
const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')
const originalRaf = window.requestAnimationFrame
const originalCancel = window.cancelAnimationFrame

type SetupOptions = {
  fine?: boolean
  reduced?: boolean
  sampledParticles?: ReadonlyArray<readonly [number, number]>
  canvasFailure?: 'none' | 'missing-context' | 'sample-error'
  observerThrows?: boolean
}

function setup({ fine = true, reduced = false, sampledParticles = [[0, 0]], canvasFailure = 'none', observerThrows = false }: SetupOptions = {}) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduced : fine,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as typeof window.matchMedia
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => { frames.set(++id, callback); return id })
  window.cancelAnimationFrame = vi.fn((frame: number) => { frames.delete(frame) })
  const resize = vi.fn()
  const disconnect = vi.fn()
  class ResizeMock {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      if (observerThrows) throw new Error('observer failed')
      this.callback = callback; instances.push(this)
    }
    observe = resize
    disconnect = disconnect
  }
  const instances: ResizeMock[] = []
  globalThis.ResizeObserver = ResizeMock as unknown as typeof ResizeObserver
  const context = {
    clearRect: vi.fn(), fillStyle: '', beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    setTransform: vi.fn(), font: '', measureText: vi.fn(() => ({ width: 100 })),
    textAlign: '', textBaseline: '', fillText: vi.fn(),
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
  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    act(() => pending.forEach((callback) => callback(performance.now())))
  }
  return { frames, instances, resize, disconnect, getContext, context, flush }
}

const flushUntilSettled = (env: ReturnType<typeof setup>, limit = 160) => {
  for (let frame = 0; frame < limit && env.frames.size; frame += 1) env.flush()
  expect(env.frames.size).toBe(0)
}

afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
  globalThis.ResizeObserver = originalResizeObserver
  window.requestAnimationFrame = originalRaf
  window.cancelAnimationFrame = originalCancel
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden)
  else Reflect.deleteProperty(document, 'hidden')
  vi.restoreAllMocks()
})

describe('ParticleText', () => {
  it('forms once in default non-interactive mode and rebuilds only on size change', () => {
    const env = setup()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const view = render(<ParticleText text="WENHAO" />)
    expect(screen.getByRole('img', { name: 'WENHAO' }).querySelector('canvas')).toBeInTheDocument()
    expect(env.frames.size).toBe(1)
    for (let i = 0; i < 12; i++) env.flush()
    expect(env.frames.size).toBe(0)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    fireEvent.pointerMove(screen.getByRole('img', { name: 'WENHAO' }))
    expect(env.frames.size).toBe(0)
    vi.spyOn(screen.getByRole('img', { name: 'WENHAO' }), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 40))
    act(() => env.instances[0].callback([], env.instances[0] as unknown as ResizeObserver))
    expect(env.frames.size).toBeGreaterThan(0)
    view.unmount()
    expect(env.frames.size).toBe(0)
    expect(env.disconnect).toHaveBeenCalled()
  })

  it('cancels formation when the page is hidden', () => {
    const env = setup()
    render(<ParticleText text="WENHAO" />)
    expect(env.frames.size).toBeGreaterThan(0)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(env.frames.size).toBe(0)
  })

  it('cancels a queued resize on hide and rebuilds from the latest size only after resume', () => {
    const env = setup()
    const view = render(<ParticleText text="WENHAO" />)
    const root = screen.getByRole('img', { name: 'WENHAO' })
    const bounds = vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 40))
    act(() => env.instances[0].callback([], env.instances[0] as unknown as ResizeObserver))
    expect(env.frames.size).toBeGreaterThan(0)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(env.frames.size).toBe(0)
    bounds.mockReturnValue(new DOMRect(0, 0, 120, 44))
    act(() => env.instances[0].callback([], env.instances[0] as unknown as ResizeObserver))
    expect(env.frames.size).toBe(0)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(root.querySelector('canvas')).toHaveAttribute('width', String(Math.round(120 * Math.min(window.devicePixelRatio || 1, 2))))
    expect(env.frames.size).toBeGreaterThan(0)
    view.unmount()
  })

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
})
