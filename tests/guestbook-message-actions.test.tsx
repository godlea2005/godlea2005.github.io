import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageTimeline } from '../src/guestbook/MessageTimeline'

afterEach(cleanup)

describe('populated guestbook action clipping', () => {
  it.each(['hover', 'focus', 'mobile'] as const)('gives all six actions an unclipped wrapping container on %s', async (state) => {
    // JSDOM does not evaluate media queries or :focus-within. Apply the actual
    // matching production rules to a state class, without rewriting declarations.
    const style = document.createElement('style')
    style.textContent = readFileSync('src/guestbook/guestbook.css', 'utf8')
    document.head.append(style)
    const activeStyle = document.createElement('style')
    const matchingRules = Array.from(style.sheet!.cssRules).flatMap((rule) => {
      if (rule instanceof CSSMediaRule) {
        return state === 'mobile' && rule.conditionText === '(max-width: 900px)'
          ? Array.from(rule.cssRules).filter((entry): entry is CSSStyleRule => entry instanceof CSSStyleRule && entry.selectorText === '.message-actions')
          : []
      }
      return state !== 'mobile' && rule instanceof CSSStyleRule && rule.selectorText.includes(`.message-bubble:${state === 'focus' ? 'focus-within' : 'hover'}`) ? [rule] : []
    })
    activeStyle.textContent = matchingRules.map((rule) => `.test-expanded .message-actions { ${rule.style.cssText} }`).join('\n')
    document.head.append(activeStyle)
    try {
      const view = render(<main className="guestbook-page"><MessageTimeline loading={false} viewerIsOwner messages={[{
        id: 'populated', author: 'Test', emailHash: '', website: '', content: 'Populated message',
        createdAt: '2026-10-24T00:00:00Z', isOwner: false, status: 'pending', canManage: true,
        clientMeta: { browser: 'Test', platform: 'Test' },
      }]} onReply={vi.fn()} onNotice={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onModerate={vi.fn()} /></main>)
      const actions = screen.getByRole('group', { name: '留言操作' })
      const buttons = within(actions).getAllByRole('button')
      expect(buttons).toHaveLength(6)
      expect(getComputedStyle(actions).height).toBe('0px')
      if (state === 'focus') { buttons[0].focus(); expect(buttons[0]).toHaveFocus() }
      if (state === 'hover') await userEvent.hover(actions.parentElement!)
      view.container.firstElementChild!.classList.add('test-expanded')
      expect(matchingRules.length).toBeGreaterThan(0)
      const expanded = getComputedStyle(actions)
      expect(expanded.height).toBe('auto')
      expect(expanded.minHeight).toBe('44px')
      expect(expanded.flexWrap).toBe('wrap')
      expect(expanded.overflow).toBe('visible')
      expect(expanded.opacity).toBe('1')
      buttons.forEach((button) => expect(getComputedStyle(button).minHeight).toBe('44px'))
    } finally {
      style.remove()
      activeStyle.remove()
    }
  })
})
