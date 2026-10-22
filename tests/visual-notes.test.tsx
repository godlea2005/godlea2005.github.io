import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { visualNotes } from '../src/editorial'
import { VisualNotes } from '../src/editorial/VisualNotes'

afterEach(cleanup)

describe('VisualNotes', () => {
  it('renders six semantic figures in source order with native lazy images and approved metadata', () => {
    render(<VisualNotes />)

    const figures = screen.getAllByRole('figure')
    expect(figures).toHaveLength(6)

    figures.forEach((figure, index) => {
      const note = visualNotes[index]
      const image = within(figure).getByRole('img', { name: note.alt })
      expect(image).toHaveAttribute('src', note.image)
      expect(image).toHaveAttribute('loading', 'lazy')
      expect(figure).toHaveTextContent(note.caption)
      expect(within(figure).getByText(note.date)).toBeInTheDocument()
    })
  })

  it('opens the selected note through the shared modal and closes with Escape', async () => {
    const user = userEvent.setup()
    const { container } = render(<main><VisualNotes /></main>)
    const note = visualNotes.find((item) => item.id === 'quiet-window')!
    const trigger = screen.getByRole('button', { name: '查看：雨夜工作室窗口' })

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '视觉随记：雨夜工作室窗口' })
    expect(within(dialog).getByRole('img', { name: note.alt })).toHaveAttribute('src', note.image)
    expect(dialog).toHaveTextContent(note.caption)
    expect(dialog).toHaveTextContent(note.date)
    expect(container).toHaveAttribute('inert')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(container).not.toHaveAttribute('inert')
  })

  it('keeps the figure and caption while exposing an accessible grid fallback after an image error', () => {
    render(<VisualNotes />)
    const note = visualNotes[0]
    const figure = screen.getAllByRole('figure')[0]
    const image = within(figure).getByRole('img', { name: note.alt })

    fireEvent.error(image)

    expect(figure).toHaveClass('is-image-error')
    expect(figure).toHaveTextContent(note.caption)
    expect(image).not.toBeVisible()
    expect(within(figure).getByRole('img', { name: note.alt })).toBeVisible()
  })
})
