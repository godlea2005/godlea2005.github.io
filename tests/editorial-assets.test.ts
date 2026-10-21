import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectSummaries, visualNotes } from '../src/editorial/index'

describe('editorial artwork', () => {
  it('keeps exactly six local, optimized WebP visual-note assets', () => {
    const directory = resolve(process.cwd(), 'public/images/field-notes')
    const paths = visualNotes.map((note) => note.image)

    expect(new Set(paths).size).toBe(6)
    expect(existsSync(directory)).toBe(true)

    const files = readdirSync(directory)
    expect(files).toHaveLength(6)
    expect(files.every((file) => file.endsWith('.webp'))).toBe(true)
    expect(new Set(files)).toEqual(new Set(paths.map((path) => path.split('/').at(-1))))

    let combinedSize = 0
    for (const path of paths) {
      const file = resolve(process.cwd(), 'public', path.replace(/^\//, ''))
      expect(existsSync(file)).toBe(true)
      const bytes = readFileSync(file)
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP')
      expect(bytes.byteLength).toBeLessThanOrEqual(450_000)
      combinedSize += statSync(file).size
    }
    expect(combinedSize).toBeLessThanOrEqual(2_400_000)
    expect(projectSummaries.every((project) => paths.includes(project.cover))).toBe(true)
  })
})
