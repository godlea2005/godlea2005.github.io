import { useEffect, useState } from 'react'

/** Retain closing content for its exit, without retaining its accessibility/focus state. */
export function useAnimatedPresence(open: boolean, duration: number): boolean {
  const [retained, setRetained] = useState(open)
  useEffect(() => {
    if (open) { setRetained(true); return }
    if (!retained) return
    if (!duration) { setRetained(false); return }
    const timer = window.setTimeout(() => setRetained(false), duration)
    return () => window.clearTimeout(timer)
  }, [open, duration, retained])
  return open || (duration > 0 && retained)
}
