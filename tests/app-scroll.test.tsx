import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../src/components/FloatingHeader', () => ({ FloatingHeader: () => <button>Stable header</button> }))
vi.mock('../src/components/TargetCursor', () => ({ TargetCursor: () => null }))
vi.mock('../src/music/GlobalMusicDock', () => ({ GlobalMusicDock: () => null }))
vi.mock('../src/components/HomePage', () => ({ HomePage: () => <main id="top"><h1>Home</h1><section id="featured">Featured</section><section id="about">About</section></main> }))
import App from '../src/App'

let scrollY = 900
let committedHeadings: string[] = []
const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
const navigate = (hash: string, event = 'hashchange') => {
  window.history.replaceState({}, '', `/${hash}`)
  fireEvent(window, new Event(event))
}
beforeEach(() => {
  scrollY = 900
  committedHeadings = []
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {
    scrollY = 0
    committedHeadings.push(document.querySelector('main h1')?.textContent ?? 'uncommitted')
  })
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn(function (this: Element) {
    committedHeadings.push(this.id)
  }) })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  window.history.replaceState({}, '', '/')
})

it('resets scrolled index/detail pages after commit, including repeated cached routes and popstate', async () => {
  window.history.replaceState({}, '', '/#writing')
  render(<App />)
  for (const [hash, title] of [
    ['#writing', '文章与笔记'],
    ['#article/ai-speeds-up-judgment', 'AI 不替代设计，它让判断更快抵达现场'],
    ['#project/content-growth-lab', '内容增长实验室'],
    ['#work', '项目与实验'],
    ['#article/ai-speeds-up-judgment', 'AI 不替代设计，它让判断更快抵达现场'],
    ['#project/content-growth-lab', '内容增长实验室'],
    ['#writing', '文章与笔记'],
  ]) {
    scrollY = 900
    navigate(hash, hash === '#work' ? 'popstate' : 'hashchange')
    await screen.findByRole('heading', { level: 1, name: title })
    await waitFor(() => expect(scrollY).toBe(0))
    expect(committedHeadings.at(-1)).toBe(title)
  }
  expect(committedHeadings).not.toContain('uncommitted')
})

it('resolves home anchors after home mounts without stealing focus or changing history', async () => {
  window.history.replaceState({}, '', '/#article/ai-speeds-up-judgment')
  const view = render(<App />)
  await screen.findByRole('heading', { level: 1, name: /AI 不替代设计/ })
  await waitFor(() => expect(scrollY).toBe(0))
  const header = screen.getByRole('button', { name: 'Stable header' })
  header.focus()
  for (const hash of ['#featured', '#about', '#featured']) {
    const historyLength = window.history.length
    navigate(hash)
    await waitFor(() => expect(committedHeadings.at(-1)).toBe(hash.slice(1)))
    expect(header).toHaveFocus()
    expect(window.location.hash).toBe(hash)
    expect(window.history.length).toBe(historyLength)
  }
  scrollY = 900
  navigate('#top')
  await waitFor(() => expect(scrollY).toBe(0))
  expect(committedHeadings.at(-1)).toBe('Home')
  view.unmount()
})
