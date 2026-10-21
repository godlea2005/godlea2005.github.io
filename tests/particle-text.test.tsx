import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParticleText } from '../src/components/ParticleText/ParticleText'

const originalMatchMedia = window.matchMedia
const originalResizeObserver = globalThis.ResizeObserver
const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')
const originalRaf = window.requestAnimationFrame
const originalCancel = window.cancelAnimationFrame

function setup({ fine = true, reduced = false } = {}) {
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
    constructor(callback: ResizeObserverCallback) { this.callback = callback; instances.push(this) }
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
      const data = new Uint8ClampedArray(width * height * 4)
      data[3] = 255
      return { data }
    }),
  }
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    act(() => pending.forEach((callback) => callback(performance.now())))
  }
  return { frames, instances, resize, disconnect, getContext, flush }
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
  it('forms once, settles after twelve calm frames, ignores pointer movement, and rebuilds only on size change', () => {
    const env = setup()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const view = render(<ParticleText text="WENHAO" />)
    expect(screen.getByRole('img', { name: 'WENHAO' }).querySelector('canvas')).toBeInTheDocument()
    expect(env.frames.size).toBe(1)
    for (let i = 0; i < 12; i++) env.flush()
    expect(env.frames.size).toBe(0)
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

  it.each([{ fine: false, reduced: false }, { fine: true, reduced: true }])('uses only a static wordmark for $fine/$reduced', (options) => {
    const env = setup(options)
    render(<ParticleText text="WENHAO" />)
    expect(screen.getByRole('img', { name: 'WENHAO' })).toHaveTextContent('WENHAO')
    expect(screen.getByRole('img', { name: 'WENHAO' }).querySelector('canvas')).not.toBeInTheDocument()
    expect(env.getContext).not.toHaveBeenCalled()
    expect(env.instances).toHaveLength(0)
  })
})
