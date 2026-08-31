import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import decodeJpeg, { init as initJpeg } from '@jsquash/jpeg/decode.js'
import decodePng, { init as initPng } from '@jsquash/png/decode.js'
import decodeWebp, { init as initWebp } from '@jsquash/webp/decode.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTrustedImageDecoder } from '../supabase/functions/_shared/commerce-image-decoder-core.ts'

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
const JPEG = fromBase64('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7LooooA//2Q==')
const PNG = fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
const WEBP = fromBase64('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=')
const EMPTY_ENTROPY_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 1, 0, 1, 1, 1, 0x11, 0,
  0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0xff, 0xd9,
])

const pngChunk = (type: string, payload: Uint8Array) => {
  const result = new Uint8Array(12 + payload.byteLength)
  const view = new DataView(result.buffer)
  view.setUint32(0, payload.byteLength)
  result.set(new TextEncoder().encode(type), 4)
  result.set(payload, 8)
  let crc = 0xffffffff
  for (let offset = 4; offset < 8 + payload.byteLength; offset += 1) {
    crc ^= result[offset]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  view.setUint32(8 + payload.byteLength, (crc ^ 0xffffffff) >>> 0)
  return result
}

const concatBytes = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.byteLength }
  return result
}

const EMPTY_IDAT_PNG = (() => {
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, 1)
  new DataView(ihdr.buffer).setUint32(4, 1)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return concatBytes(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', new Uint8Array()), pngChunk('IEND', new Uint8Array()),
  )
})()

const FRAMELESS_ANIMATED_WEBP = (() => {
  const chunk = (type: string, payload: Uint8Array) => {
    const result = new Uint8Array(8 + payload.byteLength + (payload.byteLength & 1))
    result.set(new TextEncoder().encode(type))
    new DataView(result.buffer).setUint32(4, payload.byteLength, true)
    result.set(payload, 8)
    return result
  }
  const chunks = concatBytes(chunk('VP8X', new Uint8Array(10)), chunk('ANMF', new Uint8Array(16)))
  const result = new Uint8Array(12 + chunks.byteLength)
  result.set(new TextEncoder().encode('RIFF'))
  new DataView(result.buffer).setUint32(4, result.byteLength - 8, true)
  result.set(new TextEncoder().encode('WEBP'), 8)
  result.set(chunks, 12)
  return result
})()

const wasmModule = (path: string) => WebAssembly.compile(readFileSync(resolve(process.cwd(), path)))

describe('trusted commerce image decoder', () => {
  beforeAll(async () => {
    await (initJpeg as unknown as (module: WebAssembly.Module) => Promise<void>)(await wasmModule('supabase/functions/commerce-upload/vendor/mozjpeg_dec.wasm'))
    await initPng(await wasmModule('supabase/functions/commerce-upload/vendor/squoosh_png_bg.wasm'))
    await (initWebp as unknown as (module: WebAssembly.Module) => Promise<void>)(await wasmModule('supabase/functions/commerce-upload/vendor/webp_dec.wasm'))
  })

  const decoder = createTrustedImageDecoder({
    jpeg: decodeJpeg,
    png: decodePng,
    webp: decodeWebp,
    // Model a permissive native decoder: pinned WASM must still be authoritative.
    native: async () => ({ width: 1, height: 1 }),
  })

  it('actually decodes valid 1x1 JPEG, PNG, and WebP fixtures through pinned WASM', async () => {
    await expect(decoder(JPEG, 'image/jpeg')).resolves.toMatchObject({ width: 1, height: 1 })
    await expect(decoder(PNG, 'image/png')).resolves.toMatchObject({ width: 1, height: 1 })
    await expect(decoder(WEBP, 'image/webp')).resolves.toMatchObject({ width: 1, height: 1 })
  })

  it('rejects the three structurally plausible reviewer fixtures during real decode', async () => {
    await expect(decoder(EMPTY_ENTROPY_JPEG, 'image/jpeg')).rejects.toThrow()
    await expect(decoder(EMPTY_IDAT_PNG, 'image/png')).rejects.toThrow()
    await expect(decoder(FRAMELESS_ANIMATED_WEBP, 'image/webp')).rejects.toThrow()
  })

  it('pins analyzable Edge imports and bundles every decoder WASM file', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/commerce-image-decoder.ts'), 'utf8')
    const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8')
    expect(source).toContain("npm:@jsquash/jpeg@1.6.0/decode.js")
    expect(source).toContain("npm:@jsquash/png@3.1.1/decode.js")
    expect(source).toContain("npm:@jsquash/webp@1.5.0/decode.js")
    expect(config).toMatch(/\[functions\.commerce-upload\][\s\S]*static_files = \[ "\.\/functions\/commerce-upload\/vendor\/\*" \]/)
    for (const path of ['mozjpeg_dec.wasm', 'squoosh_png_bg.wasm', 'webp_dec.wasm']) {
      expect(readFileSync(resolve(process.cwd(), `supabase/functions/commerce-upload/vendor/${path}`)).byteLength).toBeGreaterThan(100_000)
    }
  })
})
