import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ToolCategoryAccordion } from '../src/components/tool-navigation/ToolCategoryAccordion'
import { toolSections } from '../src/content/tools'

afterEach(cleanup)

it('defers cards until first opening and retains inaccessible cards when closed again', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const section = toolSections.find(({ id }) => id === 'ai-chat')!
  const view = render(<ToolCategoryAccordion section={section} open={false} onToggle={onToggle} />)
  const trigger = screen.getByRole('button', { name: /AI 聊天.*5 个工具/ })
  const panel = screen.getByRole('region', { hidden: true })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).toHaveAttribute('aria-controls', panel.id)
  expect(panel).toHaveAttribute('aria-labelledby', trigger.id)
  expect(panel).toHaveAttribute('aria-hidden', 'true')
  expect(panel).toHaveAttribute('inert')
  expect(view.container.querySelector('a')).toBeNull()
  expect(view.container.querySelector('img')).toBeNull()
  await user.click(trigger)
  expect(onToggle).toHaveBeenCalledExactlyOnceWith('ai-chat')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  view.rerender(<ToolCategoryAccordion section={section} open onToggle={onToggle} />)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(panel).not.toHaveAttribute('inert')
  expect(panel).toHaveAttribute('aria-hidden', 'false')
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(section.tools.length)
  expect(links[0]).not.toHaveAttribute('tabindex', '-1')
  view.rerender(<ToolCategoryAccordion section={section} open={false} onToggle={onToggle} />)
  expect(panel).toHaveAttribute('inert')
  expect(panel).toHaveAttribute('aria-hidden', 'true')
  expect(view.container.querySelectorAll('a')).toHaveLength(section.tools.length)
  links.forEach((link) => expect(link).toHaveAttribute('tabindex', '-1'))
  expect(view.container.querySelector('a')).toBe(links[0])
})

it('mounts cards immediately when initially open', () => {
  const section = toolSections[0]
  render(<ToolCategoryAccordion section={section} open onToggle={vi.fn()} />)
  expect(screen.getAllByRole('link')).toHaveLength(section.tools.length)
})
