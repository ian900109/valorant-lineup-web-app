import { useEffect, useRef, useState } from 'react'

type Player = { mute(): void; destroy(): void }
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

export function DirectVideoPlayer({ src, startSeconds, endSeconds }: { src: string; startSeconds?: number; endSeconds?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = true
  }, [])

  return <div className="video-player-frame"><video ref={videoRef} src={src} controls playsInline autoPlay muted onLoadedMetadata={(event) => { if (startSeconds !== undefined) event.currentTarget.currentTime = startSeconds }} onTimeUpdate={(event) => { if (endSeconds !== undefined && event.currentTarget.currentTime >= endSeconds) event.currentTarget.pause() }} /></div>
}

export function YouTubeMutedPlayer({ url, startSeconds, endSeconds }: { url: string; startSeconds?: number; endSeconds?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)
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
          mute: 1,
          ...(startSeconds !== undefined ? { start: startSeconds } : {}),
          ...(endSeconds !== undefined ? { end: endSeconds } : {}),
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (cancelled) { target.destroy(); return }
            playerRef.current = target
            target.mute()
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

  return apiFailed
    ? <div className="video-player-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=1&mute=1${startSeconds !== undefined ? `&start=${startSeconds}` : ''}${endSeconds !== undefined ? `&end=${endSeconds}` : ''}`} title="點位影片" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>
    : <div className="video-player-frame"><div ref={mountRef} className="youtube-player-mount" /></div>
}
