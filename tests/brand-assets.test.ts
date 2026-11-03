import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('uses transparent PNG artwork for the header and favicon without an avatar mask', () => {
  const header = readFileSync(resolve('src/components/FloatingHeader.tsx'), 'utf8')
  const css = readFileSync(resolve('src/components/floating-header.css'), 'utf8')
  expect(header).toContain('src="/wenhao-avatar.png"')
  expect(header).not.toContain('<span aria-hidden="true">W</span>')
  expect(css).toMatch(/\.floating-brand-avatar\s*\{[^}]*object-fit:\s*contain[^}]*border-radius:\s*0/s)
  expect(readFileSync(resolve('index.html'), 'utf8')).toContain('href="/favicon.png" type="image/png"')
  for (const name of ['wenhao-avatar.png', 'favicon.png']) {
    const png = readFileSync(resolve(`public/${name}`))
    expect(png.subarray(1,4).toString()).toBe('PNG')
    expect(png[25]).toBe(6) // PNG RGBA, not a flattened image.
    expect(png.length).toBeLessThan(300_000)
  }
})

it('keeps focus feedback on the whole search field instead of an inner input rectangle', () => {
  const css = readFileSync(resolve('src/components/tool-navigation.css'), 'utf8')
  expect(css).toMatch(/\.tool-navigation-page \.tool-search-field input:focus-visible\s*\{[^}]*outline:\s*0/s)
  expect(css).toMatch(/\.tool-search-field:focus-within\s*\{[^}]*box-shadow:/s)
  expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.tool-search-field:focus-within\s*\{[^}]*outline:\s*2px solid Highlight/s)
})
