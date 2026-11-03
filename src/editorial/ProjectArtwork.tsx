import { useState } from 'react'
import './project-artwork.css'

/** Keep the cover's layout and description even when its local image fails. */
export function ProjectArtwork({ src, alt, loading = 'lazy' }: {
  src: string
  alt: string
  loading?: 'lazy' | 'eager'
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const failed = failedSource === src

  return <div className={`project-artwork${failed ? ' is-image-error' : ''}`}>
    <img src={src} alt={alt} loading={loading} decoding="async"
      aria-hidden={failed || undefined} style={failed ? { visibility: 'hidden' } : undefined}
      onError={() => setFailedSource(src)} />
    {failed && <span className="project-artwork-fallback" role="img" aria-label={alt} />}
  </div>
}
