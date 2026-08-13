import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { parseLrc, type ParsedLyric } from '../lib/lrc'
import { tracks } from './tracks'
import type { MusicContextValue, PlaybackMode, PlayerStatus } from './types'

const MusicContext = createContext<MusicContextValue | null>(null)
const modes: PlaybackMode[] = ['list', 'single', 'shuffle']

export function MusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const analyserRef = useRef<globalThis.AnalyserNode | null>(null)
  const pendingPlayRef = useRef(false)
  const trackIndexRef = useRef(0)

  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volumeState, setVolumeState] = useState(0.72)
  const [muted, setMuted] = useState(false)
  const [mode, setMode] = useState<PlaybackMode>('list')
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState('')
  const [lyrics, setLyrics] = useState<ParsedLyric[]>([])
  const [analyser, setAnalyser] = useState<globalThis.AnalyserNode | null>(null)
  const track = tracks[trackIndex]

  useEffect(() => {
    trackIndexRef.current = trackIndex
    setCurrentTime(0)
    setDuration(0)
    setStatus('loading')
    setError('')

    const audio = audioRef.current
    if (audio) {
      audio.src = track.src
      audio.load()
    }

    const controller = new AbortController()
    void fetch(track.lrcSrc, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('歌词加载失败')
        return response.text()
      })
      .then((source) => setLyrics(parseLrc(source)))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setLyrics([])
      })

    return () => controller.abort()
  }, [track.src, track.lrcSrc])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volumeState
    audio.muted = muted
  }, [volumeState, muted])

  useEffect(() => () => {
    void audioContextRef.current?.close()
  }, [])

  const ensureAnalyser = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return null

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext
      const context = new AudioContextClass()
      const source = context.createMediaElementSource(audio)
      const nextAnalyser = context.createAnalyser()
      nextAnalyser.fftSize = 256
      nextAnalyser.smoothingTimeConstant = 0.84
      source.connect(nextAnalyser)
      nextAnalyser.connect(context.destination)
      audioContextRef.current = context
      sourceRef.current = source
      analyserRef.current = nextAnalyser
      setAnalyser(nextAnalyser)
    }

    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume()
    return analyserRef.current
  }, [])

  const play = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    setError('')
    try {
      await ensureAnalyser()
      await audio.play()
    } catch {
      setStatus('error')
      setError('浏览器拦截了播放，请再点一次播放键。')
    }
  }, [ensureAnalyser])

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) await play()
    else audio.pause()
  }, [play])

  const selectTrack = useCallback((index: number, autoplay = true) => {
    const normalized = (index + tracks.length) % tracks.length
    if (normalized === trackIndexRef.current) {
      if (autoplay) void play()
      return
    }
    pendingPlayRef.current = autoplay
    setTrackIndex(normalized)
  }, [play])

  const chooseNextIndex = useCallback((direction: 1 | -1) => {
    if (mode === 'shuffle' && tracks.length > 1) {
      let candidate = trackIndexRef.current
      while (candidate === trackIndexRef.current) candidate = Math.floor(Math.random() * tracks.length)
      return candidate
    }
    return (trackIndexRef.current + direction + tracks.length) % tracks.length
  }, [mode])

  const previous = useCallback(() => selectTrack(chooseNextIndex(-1)), [chooseNextIndex, selectTrack])
  const next = useCallback(() => selectTrack(chooseNextIndex(1)), [chooseNextIndex, selectTrack])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    const nextTime = Math.max(0, Math.min(time, Number.isFinite(audio.duration) ? audio.duration : 0))
    audio.currentTime = nextTime
    setCurrentTime(nextTime)
  }, [])

  const setVolume = useCallback((volume: number) => {
    const normalized = Math.max(0, Math.min(volume, 1))
    setVolumeState(normalized)
    if (normalized > 0) setMuted(false)
  }, [])

  const toggleMute = useCallback(() => setMuted((value) => !value), [])
  const cycleMode = useCallback(() => setMode((value) => modes[(modes.indexOf(value) + 1) % modes.length]), [])

  const handleEnded = useCallback(() => {
    if (mode === 'single') {
      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        void play()
      }
      return
    }
    pendingPlayRef.current = true
    setTrackIndex(chooseNextIndex(1))
  }, [chooseNextIndex, mode, play])

  const activeLyric = useMemo(() => {
    let active = -1
    for (let index = 0; index < lyrics.length; index += 1) {
      if (currentTime < lyrics[index].time) break
      active = index
    }
    return active
  }, [currentTime, lyrics])

  const value = useMemo<MusicContextValue>(() => ({
    tracks,
    track,
    trackIndex,
    playing,
    currentTime,
    duration,
    volume: volumeState,
    muted,
    mode,
    status,
    error,
    lyrics,
    activeLyric,
    analyser,
    togglePlay,
    selectTrack,
    previous,
    next,
    seek,
    setVolume,
    toggleMute,
    cycleMode,
  }), [activeLyric, analyser, currentTime, duration, error, lyrics, mode, muted, next, playing, previous, seek, selectTrack, setVolume, status, toggleMute, togglePlay, track, trackIndex, volumeState, cycleMode])

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onCanPlay={() => {
          setStatus('ready')
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false
            void play()
          }
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => { setPlaying(true); setStatus('playing') }}
        onPause={() => { setPlaying(false); setStatus('ready') }}
        onWaiting={() => setStatus('buffering')}
        onPlaying={() => setStatus('playing')}
        onEnded={handleEnded}
        onError={() => { setStatus('error'); setError('音频文件加载失败，请稍后再试。') }}
      />
    </MusicContext.Provider>
  )
}

export function useMusic() {
  const context = useContext(MusicContext)
  if (!context) throw new Error('useMusic must be used inside MusicProvider')
  return context
}
