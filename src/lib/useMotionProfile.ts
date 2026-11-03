import { useEffect, useState } from 'react'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
const fineHoverQuery = '(hover: hover) and (pointer: fine)'

export type MotionProfile = {
  reducedMotion: boolean
  fineHover: boolean
  pageVisible: boolean
}

function readProfile(): MotionProfile {
  return {
    reducedMotion: typeof window.matchMedia === 'function' && window.matchMedia(reducedMotionQuery).matches,
    fineHover: typeof window.matchMedia === 'function' && window.matchMedia(fineHoverQuery).matches,
    pageVisible: !document.hidden,
  }
}

export function useMotionProfile(): MotionProfile {
  const [profile, setProfile] = useState(readProfile)

  useEffect(() => {
    const motion = typeof window.matchMedia === 'function' ? window.matchMedia(reducedMotionQuery) : null
    const hover = typeof window.matchMedia === 'function' ? window.matchMedia(fineHoverQuery) : null
    const sync = () => setProfile({
      reducedMotion: motion?.matches ?? false,
      fineHover: hover?.matches ?? false,
      pageVisible: !document.hidden,
    })
    motion?.addEventListener('change', sync)
    hover?.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      motion?.removeEventListener('change', sync)
      hover?.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  return profile
}
