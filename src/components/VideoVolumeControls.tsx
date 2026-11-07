import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

type Player = {
  setVolume(volume: number): void
  mute(): void
  unMute(): void
  destroy(): void
}

type PlayerEvent = { target: Player }
type YouTubeApi = {
  Player: new (element: HTMLElement, options: {
    videoId: string
    playerVars: Record<string, string | number>
    events: { onReady: (event: PlayerEvent) => void }
  }) => Player
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api]') ?? document.createElement('script')
    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube 播放器尚未載入'))
    }
    script.onerror = () => reject(new Error('YouTube 播放器載入失敗'))
    if (!script.src) {
      script.src = 'https://www.youtube.com/iframe_api'
      script.dataset.youtubeIframeApi = 'true'
      document.head.appendChild(script)
    }
  }).catch((error: unknown) => {
    youtubeApiPromise = null
    throw error
  })

  return youtubeApiPromise
}

function youtubeVideoId(url: string) {
  return url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/)?.[1] ?? ''
}

export function DirectVideoVolumePlayer({ src, startSeconds, endSeconds }: { src: string; startSeconds?: number; endSeconds?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [volume, setVolume] = useState(65)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.volume = volume / 100
    videoRef.current.muted = muted
  }, [volume, muted])

  return <>
    <div className="video-player-frame"><video ref={videoRef} src={src} controls playsInline autoPlay onLoadedMetadata={(event) => { if (startSeconds !== undefined) event.currentTarget.currentTime = startSeconds }} onTimeUpdate={(event) => { if (endSeconds !== undefined && event.currentTarget.currentTime >= endSeconds) event.currentTarget.pause() }} onVolumeChange={(event) => { setVolume(Math.round(event.currentTarget.volume * 100)); setMuted(event.currentTarget.muted) }} /></div>
    <div className="video-volume-controls">
      <button type="button" aria-label={muted ? '取消靜音' : '靜音'} onClick={() => setMuted((value) => { const nextMuted = !value; if (value && volume === 0) setVolume(65); return nextMuted })}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? '取消靜音' : '靜音'}</button>
      <input aria-label="影片音量" type="range" min="0" max="100" value={muted ? 0 : volume} onChange={(event) => { const nextVolume = Number(event.currentTarget.value); setVolume(nextVolume); setMuted(nextVolume === 0) }} />
      <span>{muted ? 0 : volume}%</span>
    </div>
  </>
}

export function YouTubeVolumePlayer({ url, startSeconds, endSeconds }: { url: string; startSeconds?: number; endSeconds?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)
  const [volume, setVolume] = useState(65)
  const [muted, setMuted] = useState(false)
  const [apiFailed, setApiFailed] = useState(false)
  const videoId = youtubeVideoId(url)

  useEffect(() => {
    let cancelled = false
    void loadYouTubeApi().then((api) => {
      if (cancelled || !mountRef.current) return
      const player = new api.Player(mountRef.current, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          ...(startSeconds !== undefined ? { start: startSeconds } : {}),
          ...(endSeconds !== undefined ? { end: endSeconds } : {}),
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (cancelled) { target.destroy(); return }
            playerRef.current = target
            target.setVolume(65)
          },
        },
      })
      playerRef.current = player
    }).catch(() => { if (!cancelled) setApiFailed(true) })

    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [videoId, startSeconds, endSeconds])

  const toggleMute = () => {
    const nextMuted = !muted
    if (nextMuted) playerRef.current?.mute()
    else {
      if (volume === 0) { setVolume(65); playerRef.current?.setVolume(65) }
      playerRef.current?.unMute()
    }
    setMuted(nextMuted)
  }

  return <>
    {apiFailed ? <div className="video-player-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=1${startSeconds !== undefined ? `&start=${startSeconds}` : ''}${endSeconds !== undefined ? `&end=${endSeconds}` : ''}`} title="點位影片" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div> : <div className="video-player-frame"><div ref={mountRef} className="youtube-player-mount" /></div>}
    {apiFailed ? <small className="video-volume-note">請使用影片播放器內的音量控制。</small> : <div className="video-volume-controls">
      <button type="button" aria-label={muted ? '取消靜音' : '靜音'} onClick={toggleMute}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? '取消靜音' : '靜音'}</button>
      <input aria-label="影片音量" type="range" min="0" max="100" value={muted ? 0 : volume} onChange={(event) => {
        const nextVolume = Number(event.currentTarget.value)
        setVolume(nextVolume)
        setMuted(nextVolume === 0)
        if (nextVolume === 0) playerRef.current?.mute()
        else { playerRef.current?.unMute(); playerRef.current?.setVolume(nextVolume) }
      }} />
      <span>{muted ? 0 : volume}%</span>
    </div>}
  </>
}
