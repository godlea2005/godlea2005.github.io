import type {
  TrustedImageDecoder,
  TrustedImageDimensions,
  TrustedImageMime,
} from './commerce-upload-runtime.ts'

type WasmDecoder = (buffer: ArrayBuffer) => Promise<TrustedImageDimensions>

const exactBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
) as ArrayBuffer

export const createTrustedImageDecoder = (dependencies: {
  jpeg: WasmDecoder
  png: WasmDecoder
  webp: WasmDecoder
  native?: (bytes: Uint8Array, mimeType: Exclude<TrustedImageMime, 'image/webp'>) => Promise<TrustedImageDimensions>
}): TrustedImageDecoder => async (bytes, mimeType) => {
  let nativeDimensions: TrustedImageDimensions | null = null
  if (mimeType !== 'image/webp' && dependencies.native) {
    try {
      nativeDimensions = await dependencies.native(bytes, mimeType)
    } catch {
      // The Edge runtime may not expose a native decoder for every supported format.
      // Pinned WASM remains the deterministic authority.
    }
  }

  const buffer = exactBuffer(bytes)
  const decoded = mimeType === 'image/jpeg'
    ? await dependencies.jpeg(buffer)
    : mimeType === 'image/png'
      ? await dependencies.png(buffer)
      : await dependencies.webp(buffer)
  if (
    nativeDimensions
    && (nativeDimensions.width !== decoded.width || nativeDimensions.height !== decoded.height)
  ) throw new Error('native and pinned image decoders disagree')
  return decoded
}
