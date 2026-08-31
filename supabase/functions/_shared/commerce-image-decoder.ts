import decodeJpeg, { init as initJpeg } from 'npm:@jsquash/jpeg@1.6.0/decode.js'
import decodePng, { init as initPng } from 'npm:@jsquash/png@3.1.1/decode.js'
import decodeWebp, { init as initWebp } from 'npm:@jsquash/webp@1.5.0/decode.js'
import { createTrustedImageDecoder } from './commerce-image-decoder-core.ts'
import type { TrustedImageDimensions } from './commerce-upload-runtime.ts'

const runtime = globalThis as unknown as {
  Deno?: { readFile(path: URL): Promise<Uint8Array> }
  createImageBitmap?: (
    source: Blob,
    options?: { imageOrientation?: 'none' | 'flipY' | 'from-image' },
  ) => Promise<{ width: number; height: number; close(): void }>
}

const compileBundledWasm = async (relativePath: string) => {
  if (!runtime.Deno?.readFile) throw new Error('Edge WASM loader is unavailable')
  return await WebAssembly.compile(await runtime.Deno.readFile(new URL(relativePath, import.meta.url)))
}

let jpegReady: Promise<void> | undefined
let pngReady: Promise<void> | undefined
let webpReady: Promise<void> | undefined

const jpeg = async (buffer: ArrayBuffer) => {
  jpegReady ??= compileBundledWasm('../commerce-upload/vendor/mozjpeg_dec.wasm')
    .then((module) => (initJpeg as unknown as (module: WebAssembly.Module) => Promise<void>)(module))
  await jpegReady
  return await decodeJpeg(buffer)
}

const png = async (buffer: ArrayBuffer) => {
  pngReady ??= compileBundledWasm('../commerce-upload/vendor/squoosh_png_bg.wasm')
    .then((module) => initPng(module))
    .then(() => undefined)
  await pngReady
  return await decodePng(buffer)
}

const webp = async (buffer: ArrayBuffer) => {
  webpReady ??= compileBundledWasm('../commerce-upload/vendor/webp_dec.wasm')
    .then((module) => (initWebp as unknown as (module: WebAssembly.Module) => Promise<void>)(module))
  await webpReady
  return await decodeWebp(buffer)
}

const native = async (bytes: Uint8Array, mimeType: 'image/jpeg' | 'image/png'): Promise<TrustedImageDimensions> => {
  if (!runtime.createImageBitmap) throw new Error('native image decoder unavailable')
  const bitmap = await runtime.createImageBitmap(
    new Blob([bytes], { type: mimeType }),
    { imageOrientation: 'none' },
  )
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

export const decodeCommerceImage = createTrustedImageDecoder({ jpeg, png, webp, native })
