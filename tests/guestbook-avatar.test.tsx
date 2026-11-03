import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { accountAvatar, safeAvatarUrl } from '../src/guestbook/avatar'
import { GuestAvatar } from '../src/guestbook/GuestAvatar'

afterEach(cleanup)
it('reads GitHub/Google metadata, excluding anonymous identities and unsafe URLs', () => {
  expect(accountAvatar({ user_metadata: { avatar_url: 'https://avatars.githubusercontent.com/u/123' } })).toBe('https://avatars.githubusercontent.com/u/123')
  expect(accountAvatar({ user_metadata: { picture: 'https://example.com/photo.png' } })).toBe('https://example.com/photo.png')
  expect(accountAvatar({ is_anonymous: true, user_metadata: { avatar_url: 'https://example.com/private.png' } })).toBeUndefined()
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,test', 'http://example.com/a', 'https://secret@example.com/a']) expect(safeAvatarUrl(url)).toBeUndefined()
})
it('shows the account photo, recovers to initials on failure and retries a different account URL', () => {
  const view = render(<GuestAvatar name="文昊" url="https://example.com/one.png" />)
  expect(view.container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
  fireEvent.error(view.container.querySelector('img')!)
  expect(view.container).toHaveTextContent('文昊')
  view.rerender(<GuestAvatar name="访客" url="https://example.com/two.png" />)
  expect(view.container.querySelector('img')).toHaveAttribute('src','https://example.com/two.png')
  view.rerender(<GuestAvatar name="访客" />)
  expect(view.container.querySelector('img')).toBeNull()
})
it('keeps a fixed refresh icon and exposes its pending state without wrapping text', () => {
  const page = readFileSync('src/components/GuestbookPage.tsx','utf8')
  const css = readFileSync('src/guestbook/guestbook.css','utf8')
  expect(page).toContain('aria-busy={syncing}')
  expect(page).not.toContain("{syncing ? '同步中' : '↻'}")
  expect(css).toMatch(/\.guestbook-board-header \.guestbook-sync\s*\{[^}]*flex:\s*0 0 44px[^}]*width:\s*44px[^}]*height:\s*44px/s)
})
