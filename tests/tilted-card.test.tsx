import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectSummaries } from '../src/editorial'
import { SelectedWork } from '../src/components/SelectedWork'
import { TiltedCard } from '../src/editorial/TiltedCard'

type MediaOptions = { reducedMotion?: boolean; fineHover?: boolean }

const originalMatchMedia = window.matchMedia

function setMedia({ reducedMotion = false, fineHover = true }: MediaOptions = {}) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reducedMotion : fineHover,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })) as typeof window.matchMedia
}

function setCardBounds(element: HTMLElement) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 300,
    bottom: 200,
    width: 300,
    height: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
  vi.restoreAllMocks()
})

describe('TiltedCard', () => {
  it('clamps top-right pointer tilt to six degrees and resets on leave, cancel, and blur', () => {
    setMedia()
    const { unmount } = render(<TiltedCard href="#project/demo" label="查看示例项目">示例项目</TiltedCard>)
    const link = screen.getByRole('link', { name: '查看示例项目' })
    setCardBounds(link)

    fireEvent.pointerMove(link, { clientX: 300, clientY: 0 })
    expect(link.style.getPropertyValue('--tilt-x')).toBe('6deg')
    expect(link.style.getPropertyValue('--tilt-y')).toBe('6deg')
    expect(link.style.getPropertyValue('--glare-x')).toBe('100%')
    expect(link.style.getPropertyValue('--glare-y')).toBe('0%')

    fireEvent.pointerLeave(link)
    expect(link.style.getPropertyValue('--tilt-x')).toBe('0deg')
    expect(link.style.getPropertyValue('--tilt-y')).toBe('0deg')
    expect(link.style.getPropertyValue('--glare-x')).toBe('50%')
    expect(link.style.getPropertyValue('--glare-y')).toBe('50%')

    fireEvent.pointerMove(link, { clientX: 300, clientY: 0 })
    fireEvent.pointerCancel(link)
    expect(link.style.getPropertyValue('--tilt-x')).toBe('0deg')
    expect(link.style.getPropertyValue('--tilt-y')).toBe('0deg')
    expect(link.style.getPropertyValue('--glare-x')).toBe('50%')
    expect(link.style.getPropertyValue('--glare-y')).toBe('50%')

    fireEvent.pointerMove(link, { clientX: 300, clientY: 0 })
    fireEvent.blur(link)
    expect(link.style.getPropertyValue('--tilt-x')).toBe('0deg')
    expect(link.style.getPropertyValue('--tilt-y')).toBe('0deg')
    unmount()
  })

  it.each([
    ['reduced motion', { reducedMotion: true, fineHover: true }],
    ['a non-fine pointer', { reducedMotion: false, fineHover: false }],
  ] as const)('does not apply pointer transforms for %s', (_label, media) => {
    setMedia(media)
    const { unmount } = render(<TiltedCard href="#project/demo" label="查看示例项目">示例项目</TiltedCard>)
    const link = screen.getByRole('link', { name: '查看示例项目' })
    setCardBounds(link)

    fireEvent.pointerMove(link, { clientX: 300, clientY: 0 })

    expect(link.style.getPropertyValue('--tilt-x')).toBe('0deg')
    expect(link.style.getPropertyValue('--tilt-y')).toBe('0deg')
    unmount()
  })

  it('remains a normal accessible anchor and exposes the approved target-cursor metadata', () => {
    setMedia()
    render(<TiltedCard href="#project/demo" label="查看示例项目">示例项目</TiltedCard>)
    const link = screen.getByRole('link', { name: '查看示例项目' })

    expect(link).toHaveAttribute('href', '#project/demo')
    expect(link).toHaveAttribute('data-target-cursor', '')
    expect(link).toHaveAttribute('data-cursor-label', '查看案例')
    expect(link).not.toHaveAttribute('tabindex', '-1')
  })
})

describe('SelectedWork', () => {
  it('renders exactly the three honest project summaries as their real routes', () => {
    setMedia()
    const { container } = render(<SelectedWork />)
    const links = screen.getAllByRole('link')

    expect(links).toHaveLength(3)
    projectSummaries.forEach((project) => {
      const link = screen.getByRole('link', { name: project.title })
      expect(link).toHaveAttribute('href', `#project/${project.slug}`)
      expect(link).toHaveAttribute('data-target-cursor', '')
      expect(link).toHaveAttribute('data-cursor-label', '查看案例')
      expect(link).toHaveTextContent('个人实验')
      expect(link).toHaveTextContent(project.role)
      expect(link).toHaveTextContent(project.period)
      expect(link).toHaveTextContent(project.summary)
      project.tags.forEach((tag) => expect(link).toHaveTextContent(tag))
      expect(link.querySelector('img')).toHaveAttribute('src', project.cover)
      expect(link.querySelector('img')).toHaveAttribute('alt', project.coverAlt)
    })
    expect(container.querySelectorAll('.selected-work-card')).toHaveLength(3)
  })
})
