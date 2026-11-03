import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { useGuideLayout } from '../src/components/home-guide/useGuideLayout'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (Element.prototype as Partial<Element>).animate })

function Harness({ enabled = true, afterCapture }: { enabled?: boolean; afterCapture?: () => void }) {
  const [active, setActive] = useState<string | null>(null)
  const { grid, capture } = useGuideLayout(active, enabled)
  return <div ref={grid} data-open={!!active}><button onClick={() => { capture(); afterCapture?.(); setActive(active ? null : 'stats') }}>toggle</button>{[0,1,2,3].map(n => <article className="home-guide-card" key={n} />)}</div>
}

it('animates all four painted card rectangles and surrounding grid height', () => {
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel }))
  let paintedWidth: number | null = null
  vi.stubGlobal('Animation', class {})
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
    const open = this.closest('[data-open]')?.getAttribute('data-open') === 'true'
    return { x: 0, y: 0, left: 0, top: 0, width: paintedWidth ?? (open ? 620 : 300), height: open ? 480 : 400, right: 620, bottom: 480, toJSON() {} }
  })
  const view = render(<Harness />)
  fireEvent.click(screen.getByText('toggle'))
  expect(animate).toHaveBeenCalledTimes(5)
  expect(animate).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ width: '300px' }), expect.objectContaining({ width: '620px' }),
  ]), expect.objectContaining({ duration: 620 }))
  paintedWidth = 420
  fireEvent.click(screen.getByText('toggle'))
  expect(cancel).toHaveBeenCalledTimes(5)
  expect(animate.mock.calls[5][0][0]).toHaveProperty('width', '420px')
  act(() => window.dispatchEvent(new Event('resize')))
  expect(cancel).toHaveBeenCalledTimes(10)
  view.unmount()
})

it('settles without animations when motion is disabled', () => {
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  render(<Harness enabled={false} />)
  fireEvent.click(screen.getByText('toggle'))
  expect(animate).not.toHaveBeenCalled()
})

it('does not count viewport scrolling as card motion between capture and commit', () => {
  let scrollOffset = 0
  const animate = vi.fn(() => ({ cancel: vi.fn() }))
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
    const top = scrollOffset + (this.classList.contains('home-guide-card') ? 10 : 0)
    return { x: 0, y: top, left: 0, top, width: 300, height: 400, right: 300, bottom: top + 400, toJSON() {} }
  })
  render(<Harness afterCapture={() => { scrollOffset = 250 }} />)
  fireEvent.click(screen.getByText('toggle'))
  expect(animate.mock.calls[0][0][0]).toHaveProperty('transform', 'translate(0px,0px)')
})
