import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SelectedWork } from '../src/components/SelectedWork'
import { WorkIndexPage } from '../src/editorial/WorkIndexPage'
import { ProjectPage } from '../src/editorial/ProjectPage'
import { projectSummaries } from '../src/editorial'

afterEach(cleanup)

it.each([
  ['selected work', <SelectedWork />],
  ['work index', <WorkIndexPage />],
  ['project detail', <ProjectPage slug="content-growth-lab" />],
])('preserves the image frame and accessible description when %s artwork fails', (_name, surface) => {
  render(surface)
  const description = projectSummaries[0].coverAlt
  const image = screen.getByRole('img', { name: description })
  const frame = image.parentElement
  fireEvent.error(image)
  const fallback = screen.getByRole('img', { name: description })
  expect(fallback.tagName).not.toBe('IMG')
  expect(fallback.parentElement).toBe(frame)
  expect(frame).toHaveClass('project-artwork', 'is-image-error')
  expect(image).not.toBeVisible()
  expect(frame?.querySelector('img')).toBe(image)
})

it('retries the new cover when navigating between already mounted project details', () => {
  const view = render(<ProjectPage slug={projectSummaries[0].slug} />)
  fireEvent.error(screen.getByRole('img', { name: projectSummaries[0].coverAlt }))
  view.rerender(<ProjectPage slug={projectSummaries[1].slug} />)
  expect(screen.getByRole('img', { name: projectSummaries[1].coverAlt }).tagName).toBe('IMG')
})
