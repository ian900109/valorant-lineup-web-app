import type { FormEventHandler } from 'react'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import type { Agent, Lineup, LineupImage, MapRecord } from '../types'
import ScreenCaptureTool, { type PendingScreenshot } from './ScreenCaptureTool'

type Point = { x: number; y: number }
type Props = {
  formKey: string
  maps: MapRecord[]
  agents: Agent[]
  mapId: string
  agentId: string
  start: Point | null
  impact: Point | null
  videoMode: 'full' | 'clip'
  initialLineup: Lineup | null
  saving: boolean
  saveStatus: string
  pendingScreenshots: PendingScreenshot[]
  captureEnabled: boolean
  onPendingScreenshotsChange: (images: PendingScreenshot[]) => void
  onDeleteImage: (image: LineupImage) => void
  onMapChange: (id: string) => void
  onAgentChange: (id: string) => void
  onVideoModeChange: (mode: 'full' | 'clip') => void
  onPickStart: () => void
  onPickImpact: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
  formatPoint: (point: Point) => string
  formatTimestamp: (seconds: number) => string
}

export default function LineupEditor(props: Props) {
  const agent = props.agents.find((item) => item.id === props.agentId) ?? props.agents[0]
  const existing = props.initialLineup
  return <form key={props.formKey} className={`form-stack ${props.saving ? 'form-saving' : ''}`} onSubmit={props.onSubmit} aria-busy={props.saving}>
    <label>地圖<select value={props.mapId} onChange={(event) => props.onMapChange(event.target.value)}>{props.maps.map((item) => <option key={item.id} value={item.id}>{item.shortName} · {item.name}</option>)}</select></label>
    <label>特務<select value={props.agentId} onChange={(event) => props.onAgentChange(event.target.value)}>{props.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>技能<select name="abilityId" key={props.agentId} defaultValue={agent?.abilities.find((ability) => ability.id === existing?.abilityId)?.id ?? agent?.abilities[0]?.id}>{agent?.abilities.map((item) => <option key={item.id} value={item.id}>{item.key} · {item.name}</option>)}</select></label>
    <div className="two-fields"><label>攻守<select name="side" defaultValue={existing?.side ?? '進攻'}><option>進攻</option><option>防守</option></select></label><label>點位標題<input name="title" required defaultValue={existing?.title ?? ''} placeholder="例如：A 天堂燃燒彈" /></label></div>
    <label>操作說明<textarea name="instructions" rows={3} defaultValue={existing?.instructions ?? ''} /></label>
    {Boolean(existing?.images?.length) && <div className="existing-screenshots"><b>已上傳截圖 · 可在此管理</b><div>{existing?.images?.map((image, index) => <article key={image.id}>{image.url ? <img src={image.url} alt={`已上傳截圖 ${index + 1}`} /> : <span>圖片無法載入</span>}<small>步驟 {index + 1}</small><button type="button" className="delete-asset" disabled={props.saving} onClick={() => props.onDeleteImage(image)}><Trash2 size={12} /> 刪除照片</button></article>)}</div></div>}
    <ScreenCaptureTool pending={props.pendingScreenshots} disabled={props.saving || !props.captureEnabled} onChange={props.onPendingScreenshotsChange} />
    {!props.captureEnabled && <small className="form-help">畫面截圖上傳需要連接 Supabase；目前示範模式不會上傳或保留截圖。</small>}
    <label>影片網址<input name="videoUrl" type="url" defaultValue={existing?.videoUrl ?? ''} placeholder="YouTube 或影片網址；不換影片可留原網址" /></label>
    <label>更換影片檔（Supabase Storage）<input name="videoFile" type="file" accept="video/*" /></label>
    <small className="form-help">若影片已用網址設定且不更換，保留網址即可。選擇新檔會取代舊影片。</small>
    <small className="form-help">IG 網址會直接開啟 Instagram；IG 網址不能設定片段秒數，要播放重點片段請使用 YouTube 或上傳影片檔。</small>
    <label>播放模式<select value={props.videoMode} onChange={(event) => props.onVideoModeChange(event.target.value as 'full' | 'clip')}><option value="full">播放全片</option><option value="clip">只播放指定片段</option></select></label>
    {props.videoMode === 'clip' && <><div className="two-fields"><label>片段開始時間<input name="videoStart" type="text" inputMode="numeric" placeholder="例如 01:20" pattern="(?:[0-9]+:)?[0-5]?[0-9]:[0-5][0-9]|[0-9]+" defaultValue={existing?.videoStartSeconds === undefined ? '' : props.formatTimestamp(existing.videoStartSeconds)} required /></label><label>片段結束時間<input name="videoEnd" type="text" inputMode="numeric" placeholder="例如 01:45" pattern="(?:[0-9]+:)?[0-5]?[0-9]:[0-5][0-9]|[0-9]+" defaultValue={existing?.videoEndSeconds === undefined ? '' : props.formatTimestamp(existing.videoEndSeconds)} required /></label></div><small className="form-help">可輸入 mm:ss 或 hh:mm:ss；影片播到結束時間會自動停止。</small></>}
    <div className="coord-row"><span>起始點：{props.start ? props.formatPoint(props.start) : '尚未在地圖點選'}</span><button type="button" className="outline" disabled={props.saving} onClick={props.onPickStart}>在地圖點起始位置</button></div>
    <div className="coord-row"><span>生效點：{props.impact ? props.formatPoint(props.impact) : '尚未在地圖點選'}</span><button type="button" className="outline" disabled={props.saving} onClick={props.onPickImpact}>在地圖點生效位置</button></div>
    <button className="primary" type="submit" disabled={props.saving}>{props.saving ? <><LoaderCircle className="loading-spinner" size={15} /> {props.saveStatus}</> : <><Plus size={15} /> {existing ? '儲存修改' : '儲存點位'}{props.pendingScreenshots.length ? `並上傳 ${props.pendingScreenshots.length} 張截圖` : ''}</>}</button>
    {props.saving && <small className="form-help">請稍候，請勿重複送出。影片檔較大時上傳會需要一些時間。</small>}
    <button type="button" className="text-button cancel-edit" disabled={props.saving} onClick={props.onClose}>取消</button>
  </form>
}
