export type PlaybackMode = 'list' | 'single' | 'shuffle'
export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'buffering' | 'error'

export type Track = {
  id: string
  title: string
  artist: string
  src: string
  lrcSrc: string
  accent: string
  accentRgb: string
  durationLabel: string
}

export type MusicContextValue = {
  tracks: Track[]
  track: Track
  trackIndex: number
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  mode: PlaybackMode
  status: PlayerStatus
  error: string
  lyrics: import('../lib/lrc').ParsedLyric[]
  activeLyric: number
  analyser: globalThis.AnalyserNode | null
  togglePlay: () => Promise<void>
  selectTrack: (index: number, autoplay?: boolean) => void
  previous: () => void
  next: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleMode: () => void
}
