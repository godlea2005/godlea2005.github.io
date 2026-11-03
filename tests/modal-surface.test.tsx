import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ModalSurface } from '../src/components/ModalSurface'

afterEach(cleanup)

function ModalHarness() {
  const [open, setOpen] = useState(false)
  return <main>
    <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
    {open && <ModalSurface className="test-modal" label="Test dialog" onClose={() => setOpen(false)}>
      <button type="button" data-modal-focus>First action</button>
      <button type="button">Last action</button>
    </ModalSurface>}
  </main>
}

describe('ModalSurface focus lifecycle', () => {
  it('restores the trigger after a complete backdrop pointer click', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(trigger)
    await user.click(screen.getByRole('dialog', { name: 'Test dialog' }).parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('inerts the background, wraps both Tab directions, closes on Escape, and restores trigger focus', async () => {
    const user = userEvent.setup()
    const { container } = render(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    const first = within(dialog).getByRole('button', { name: 'First action' })
    const last = within(dialog).getByRole('button', { name: 'Last action' })
    expect(container).toHaveAttribute('inert')
    expect(first).toHaveFocus()

    await user.tab({ shift: true })
    expect(last).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(container).not.toHaveAttribute('inert')
    expect(trigger).toHaveFocus()
  })
})
