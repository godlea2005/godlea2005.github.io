import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolLogo } from '../src/components/tool-navigation/ToolLogo'

afterEach(() => vi.useRealTimers())

describe('ToolLogo', () => {
  it('loads the requested favicon lazily without repeating the visible tool name', () => {
    const { container } = render(<ToolLogo name="StarDots" logoHost="stardots.io" categoryId="toolbox" />)
    const image = container.querySelector('img')!
    expect(image).toHaveAttribute('src', 'https://favicon.im/stardots.io')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('width', '28')
    expect(image).toHaveAttribute('height', '28')
  })

  it('replaces an error or timeout with deterministic initials and resets for a new host', () => {
    vi.useFakeTimers()
    const view = render(<ToolLogo name="StarDots" logoHost="broken.example" categoryId="toolbox" />)
    fireEvent.error(view.container.querySelector('img')!)
    expect(screen.getByText('ST')).toBeVisible()
    view.rerender(<ToolLogo name="GitHub" logoHost="github.com" categoryId="frontend-dev" />)
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/github.com')
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText('GI')).toBeVisible()
  })

  it('does not replace a successfully loaded image when the timeout expires', () => {
    vi.useFakeTimers()
    const view = render(<ToolLogo name="GitHub" logoHost="github.com" categoryId="frontend-dev" />)
    fireEvent.load(view.container.querySelector('img')!)
    act(() => vi.advanceTimersByTime(5000))
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/github.com')
    expect(screen.queryByText('GI')).not.toBeInTheDocument()
  })
})
