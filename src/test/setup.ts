import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// JSDOM has no layout/scroll engine. Route tests observe these browser APIs.
Object.defineProperty(window, 'scrollTo', { configurable: true, writable: true, value: vi.fn() })
Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() })

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})
