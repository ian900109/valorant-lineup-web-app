import { useEffect, useRef, useState } from 'react'
import { Camera, MonitorUp, Trash2, X } from 'lucide-react'

export type PendingScreenshot = { id: string; file: File; previewUrl: string }

type Props = {
  pending: PendingScreenshot[]
  disabled?: boolean
  onChange: (images: PendingScreenshot[]) => void
}

type Crop = { x: number; y: number; width: number; height: number }

export default function ScreenCaptureTool({ pending, disabled = false, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const [sharing, setSharing] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 16, height: 9 })
  const [crop, setCrop] = useState<Crop | null>(null)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState('')

  function stopSharing() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setSharing(false)
    setCrop(null)
  }

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
  // This component owns only stream cleanup; parent owns pending object URLs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sharing || !videoRef.current || !streamRef.current) return
    videoRef.current.srcObject = streamRef.current
    void videoRef.current.play().catch(() => setMessage('畫面預覽尚未就緒，請稍候再框選。'))
  }, [sharing])

  async function startSharing() {
    setMessage('')
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMessage('目前瀏覽器不支援螢幕擷取，請使用最新版 Chrome 或 Edge，並以 HTTPS 或 localhost 開啟。')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      const size = track.getSettings()
      setDimensions({ width: size.width || 16, height: size.height || 9 })
      track.addEventListener('ended', () => { streamRef.current = null; setSharing(false); setCrop(null) }, { once: true })
      setSharing(true)
      setMessage('拖曳框選要保留的畫面範圍；可連續擷取多張。')
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      setMessage(name === 'NotAllowedError' ? '你取消了螢幕分享，沒有擷取任何畫面。' : `無法開始擷取：${error instanceof Error ? error.message : '請確認瀏覽器權限'}`)
    }
  }

  function point(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(dimensions.width, (event.clientX - bounds.left) / bounds.width * dimensions.width)),
      y: Math.max(0, Math.min(dimensions.height, (event.clientY - bounds.top) / bounds.height * dimensions.height)),
    }
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!videoRef.current) return
    const p = point(event)
    dragRef.current = p
    setCrop({ x: p.x, y: p.y, width: 0, height: 0 })
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragging || !dragRef.current) return
    const p = point(event)
    const start = dragRef.current
    setCrop({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) })
  }

  async function captureCrop() {
    if (!videoRef.current || !crop || crop.width < 8 || crop.height < 8) {
      setMessage('請先在畫面上拖曳框選一個範圍。')
      return
    }
    const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(crop.width * scale))
    canvas.height = Math.max(1, Math.round(crop.height * scale))
    const context = canvas.getContext('2d')
    if (!context) { setMessage('瀏覽器無法建立圖片，請重試。'); return }
    context.drawImage(videoRef.current, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
    if (!blob) { setMessage('圖片產生失敗，請重新框選。'); return }
    const file = new File([blob], `lineup-step-${Date.now()}.webp`, { type: 'image/webp' })
    const previewUrl = URL.createObjectURL(file)
    onChange([...pending, { id: crypto.randomUUID(), file, previewUrl }])
    setCrop(null)
    setMessage(`已加入暫存截圖（${pending.length + 1} 張）；按「儲存點位」後才會上傳。`)
  }

  function removePending(id: string) {
    const item = pending.find((image) => image.id === id)
    if (item) URL.revokeObjectURL(item.previewUrl)
    onChange(pending.filter((image) => image.id !== id))
  }

  return <section className="capture-tool">
    <div className="capture-heading"><div><b>教學截圖</b><small>擷取畫面並框選重點，可加入多張</small></div><span>{pending.length} 張待上傳</span></div>
    {!sharing ? <button type="button" className="outline capture-start" onClick={() => void startSharing()} disabled={disabled}><MonitorUp size={15} /> 開始分享畫面並擷取</button> : <>
      <div className="capture-preview" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>
        <video ref={videoRef} muted playsInline />
        <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} preserveAspectRatio="none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
          {crop && <><defs><mask id="capture-crop-mask"><rect width={dimensions.width} height={dimensions.height} fill="white" /><rect x={crop.x} y={crop.y} width={crop.width} height={crop.height} fill="black" /></mask></defs><rect width={dimensions.width} height={dimensions.height} fill="#0008" mask="url(#capture-crop-mask)" />{crop.width > 0 && crop.height > 0 && <rect x={crop.x} y={crop.y} width={crop.width} height={crop.height} fill="none" stroke="#c9f36a" strokeWidth={Math.max(dimensions.width, dimensions.height) / 400} />}</>}
        </svg>
      </div>
      <div className="capture-actions"><button type="button" className="primary" onClick={() => void captureCrop()}><Camera size={14} /> 擷取選取範圍</button><button type="button" className="outline" onClick={stopSharing}><X size={14} /> 停止分享</button></div>
    </>}
    {message && <small className="capture-message">{message}</small>}
    {pending.length > 0 && <div className="pending-screenshots">{pending.map((item, index) => <div className="pending-screenshot" key={item.id}><img src={item.previewUrl} alt={`待上傳截圖 ${index + 1}`} /><span>{index + 1}</span><button type="button" aria-label={`移除第 ${index + 1} 張截圖`} disabled={disabled} onClick={() => removePending(item.id)}><Trash2 size={13} /></button></div>)}</div>}
  </section>
}
