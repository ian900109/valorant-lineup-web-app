import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, MapPin, Play, Plus, RotateCcw, Search, ShieldCheck, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { agents, maps, seedLineups } from './data/seed'
import { lineupRepository } from './data/lineupRepository'
import { supabase } from './lib/supabase'
import type { Lineup } from './types'

const bounds = (n: number) => Math.min(.98, Math.max(.02, n))
const formatPoint = (point: { x: number; y: number }) => `X ${Math.round(point.x * 100)}% · Y ${Math.round(point.y * 100)}%`

export default function App() {
  const [lineups, setLineups] = useState<Lineup[]>([])
  const [mapId, setMapId] = useState('ascent')
  const [agentId, setAgentId] = useState('brimstone')
  const [abilityId, setAbilityId] = useState<string | null>(null)
  const [side, setSide] = useState('全部')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Lineup | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [admin, setAdmin] = useState(false)
  const [modal, setModal] = useState<'login' | 'create' | null>(null)
  const [pick, setPick] = useState<'start' | 'impact' | null>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [impact, setImpact] = useState<{ x: number; y: number } | null>(null)
  const [notice, setNotice] = useState('')
  const [connection, setConnection] = useState<'loading' | 'demo' | 'connected' | 'error'>(supabase ? 'loading' : 'demo')
  const [videoOpen, setVideoOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const agent = agents.find((item) => item.id === agentId) ?? agents[0]

  useEffect(() => {
    let active = true
    void lineupRepository.list().then((items) => { if (active) { setLineups(items); setConnection(supabase ? 'connected' : 'demo') } }).catch((error: unknown) => {
      if (active) { setLineups(seedLineups); setConnection('error'); console.error('Supabase lineup fetch failed:', error); setNotice('Supabase 尚未完成設定，畫面暫顯示示範資料') }
    })
    if (supabase) void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) void verifyAdmin(data.session.user.id)
    })
    return () => { active = false }
  }, [])
  const visible = useMemo(() => lineups.filter((item) => item.mapId === mapId && item.agentId === agentId && (!abilityId || item.abilityId === abilityId) && (side === '全部' || item.side === side) && (!query || `${item.title} ${item.site} ${item.startLabel}`.toLowerCase().includes(query.toLowerCase()))), [lineups, mapId, agentId, abilityId, side, query])

  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 2400) }
  async function verifyAdmin(userId: string) {
    if (!supabase) return false
    const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
    if (error) { notify(`無法確認管理員權限：${error.message}`); return false }
    setAdmin(Boolean(data)); return Boolean(data)
  }
  function chooseMap(value: string) { setMapId(value); setSelected(null); setZoom(1); setPan({ x: 0, y: 0 }) }
  function pointFromEvent(event: React.PointerEvent) {
    const rect = stageRef.current!.getBoundingClientRect()
    return { x: bounds(((event.clientX - rect.left - rect.width / 2 - pan.x) / zoom + rect.width / 2) / rect.width), y: bounds(((event.clientY - rect.top - rect.height / 2 - pan.y) / zoom + rect.height / 2) / rect.height) }
  }
  function onMapPointerUp(event: React.PointerEvent) {
    if (pick) {
      const p = pointFromEvent(event)
      if (pick === 'start') setStart(p); else setImpact(p)
      setPick(null); setModal('create'); return
    }
    pointerRef.current = null
  }
  function startPicking(which: 'start' | 'impact') { setPick(which); setModal(null) }
  async function submitLineup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!start || !impact) { notify('請先在地圖上設定起始位置與生效位置'); return }
    const form = new FormData(event.currentTarget)
    const videoFile = form.get('videoFile')
    const file = videoFile instanceof File && videoFile.size ? videoFile : undefined
    const created: Lineup = { id: crypto.randomUUID(), mapId, agentId, abilityId: String(form.get('abilityId')), title: String(form.get('title')).trim(), site: formatPoint(impact), startLabel: formatPoint(start), side: String(form.get('side')) as Lineup['side'], start, impact, instructions: String(form.get('instructions')).trim(), videoUrl: String(form.get('videoUrl')).trim() || undefined, createdAt: new Date().toISOString() }
    try {
      const saved = await lineupRepository.save(created, file)
      setLineups(await lineupRepository.list()); setSelected(saved); setModal(null); setStart(null); setImpact(null)
      notify(supabase ? '點位已儲存至 Supabase' : '示範點位已儲存在這台裝置')
    } catch (error) { notify(`儲存失敗：${error instanceof Error ? error.message : '請確認資料表與權限設定'}`) }
  }
  async function deleteLineup(item: Lineup) {
    if (!admin) { notify('只有管理員可以刪除點位'); return }
    if (!window.confirm(`確定刪除「${item.title}」？此操作無法復原。`)) return
    try {
      await lineupRepository.delete(item)
      setLineups(await lineupRepository.list())
      if (selected?.id === item.id) setSelected(null)
      notify(supabase ? '點位已從 Supabase 刪除' : '示範點位已刪除')
    } catch (error) { notify(`刪除失敗：${error instanceof Error ? error.message : '請確認管理員權限'}`) }
  }
  function zoomBy(delta: number) { const next = Math.max(1, Math.min(3, zoom + delta)); setZoom(next); if (next === 1) setPan({ x: 0, y: 0 }) }
  function onPointerDown(event: React.PointerEvent) {
    if (pick || zoom === 1 || (event.target as HTMLElement).closest('button')) return
    pointerRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    stageRef.current?.setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: React.PointerEvent) { if (pointerRef.current) setPan({ x: pointerRef.current.panX + event.clientX - pointerRef.current.x, y: pointerRef.current.panY + event.clientY - pointerRef.current.y }) }
  function selectAbility(id: string) { setAbilityId(abilityId === id ? null : id); setSelected(null) }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">V</span> LINEUP</a><nav><span className="active">點位資料庫</span><span>地圖</span><span>特務</span></nav><div className="top-actions"><span className="connection"><i />{connection === 'connected' ? 'SUPABASE' : connection === 'loading' ? 'CONNECTING' : connection === 'error' ? 'SETUP NEEDED' : 'DEMO MODE'}</span><button className="outline" onClick={() => admin ? void supabase?.auth.signOut().then(() => { setAdmin(false); notify('已登出') }) : setModal('login')}>{admin ? '管理員登出' : '管理員登入'}</button></div></header>
    <main><section className="page-heading"><div><div className="eyebrow">VALORANT TACTICAL DATABASE</div><h1>LINEUP LIBRARY</h1><p>選地圖、特務與技能，確認起點和生效位置。</p></div><div className="lineup-count"><b>{String(lineups.length).padStart(2, '0')}</b> LINEUPS</div></section>
      <section className="workspace"><div className="map-card"><div className="toolbar"><label>地圖</label><select value={mapId} onChange={(e) => chooseMap(e.target.value)}>{maps.map((map) => <option key={map.id} value={map.id}>{map.shortName} · {map.name}</option>)}</select><select value={side} onChange={(e) => setSide(e.target.value)}><option>全部</option><option>進攻</option><option>防守</option></select><div className="search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋點位" /></div></div>
        <div className="agent-strip"><span className="strip-label">AGENT</span>{agents.map((item) => <button key={item.id} className={`agent-chip ${item.id === agentId ? 'chosen' : ''}`} onClick={() => { setAgentId(item.id); setAbilityId(null); setSelected(null) }}><span className="agent-initial">{item.name.slice(0, 1)}</span><span className="agent-label">{item.name}</span></button>)}</div>
        <div className={`map-stage ${pick ? 'picking' : ''}`} ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onMapPointerUp} onPointerCancel={() => { pointerRef.current = null }} onWheel={(e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? .12 : -.12) }}>
          <div className="map-world" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}><TacticalMap mapId={mapId} />
            <svg className="routes" viewBox="0 0 1000 620" preserveAspectRatio="none">{visible.map((item) => <line key={item.id} x1={item.start.x * 1000} y1={item.start.y * 620} x2={item.impact.x * 1000} y2={item.impact.y * 620} />)}</svg>
            {visible.map((item) => <div key={`${item.id}-start`} className={`map-marker start ${selected?.id === item.id ? 'selected' : ''}`} style={{ left: `${item.start.x * 100}%`, top: `${item.start.y * 100}%` }} onPointerDown={(e) => e.stopPropagation()} onClick={() => { setSelected(item); setVideoOpen(false) }} title={`起始位置：${item.startLabel}`}><span>S</span></div>)}
            {visible.map((item) => <button key={item.id} className={`map-marker impact ${selected?.id === item.id ? 'selected' : ''}`} style={{ left: `${item.impact.x * 100}%`, top: `${item.impact.y * 100}%` }} onPointerDown={(e) => e.stopPropagation()} onClick={() => { setSelected(item); setVideoOpen(false) }} title={`生效位置：${item.site}`}><Crosshair size={16} /></button>)}
            {pick && <div className="pick-preview" style={{ left: `${(pick === 'start' ? start?.x : impact?.x) ? (pick === 'start' ? start!.x : impact!.x) * 100 : 50}%`, top: `${(pick === 'start' ? start?.y : impact?.y) ? (pick === 'start' ? start!.y : impact!.y) * 100 : 50}%` }} />}
          </div>
          {pick && <div className="pick-prompt">請在地圖點選{pick === 'start' ? '起始位置' : '技能生效位置'} <button onClick={(e) => { e.stopPropagation(); setPick(null); setModal('create') }}>取消</button></div>}
          <div className="map-note">地圖底圖目前為測試示意圖，座標與互動可先試用</div><div className="zoom-controls"><button aria-label="縮小" onClick={() => zoomBy(-.25)}><ZoomOut size={16} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大" onClick={() => zoomBy(.25)}><ZoomIn size={16} /></button><button aria-label="重設" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}><RotateCcw size={15} /></button></div>
          <div className="map-legend"><span className="legend-start">S</span>起始位置 <span className="legend-impact"><MapPin size={12} /></span>生效位置</div>
        </div><div className="map-foot"><span>{maps.find((map) => map.id === mapId)?.shortName} · 戰術地圖</span><span>滾輪縮放 · 放大後拖曳移動</span></div></div>
        <aside className="side-card"><div className="side-heading"><div><b>LOADOUT</b><small>選擇特務與技能</small></div><button className="text-button" onClick={() => { setAbilityId(null); setSide('全部'); setQuery(''); setSelected(null) }}>重設</button></div>
          <div className="agent-summary"><span className="agent-big">{agent.name.slice(0, 1)}</span><div><b>{agent.name}</b><small>{agent.role}</small></div></div><div className="ability-grid">{agent.abilities.map((ability) => <button key={ability.id} className={`ability ${abilityId === ability.id ? 'chosen' : ''}`} title={ability.name} onClick={() => selectAbility(ability.id)}><span>{ability.key}</span><small>{ability.name}</small></button>)}</div>
          <div className="section-label">AVAILABLE LINEUPS <span>({visible.length})</span></div><div className="spot-list">{visible.length ? visible.map((item) => <div className="spot-row" key={item.id}><button className={`spot ${selected?.id === item.id ? 'active' : ''}`} onClick={() => { setSelected(item); setVideoOpen(false) }}><span className="spot-icon">{agent.abilities.find((ability) => ability.id === item.abilityId)?.key}</span><span className="spot-copy"><b>{item.title}</b><small>{item.side} · 起點 {formatPoint(item.start)}</small></span><span className="spot-arrow">›</span></button>{admin && <button className="spot-delete" title="刪除點位" aria-label={`刪除 ${item.title}`} onClick={() => void deleteLineup(item)}><Trash2 size={15} /></button>}</div>) : <div className="empty">沒有符合條件的點位。<br />可以換技能，或新增一個示範點位。</div>}</div>
          <div className="admin-entry"><button onClick={() => { if (admin) { setStart(null); setImpact(null); setModal('create') } else setModal('login') }}><Plus size={14} /> {admin ? '新增點位' : '管理員登入後新增點位'}</button></div>
        </aside></section>
      {selected && <section className="detail-panel"><div className="detail-title"><div><div className="eyebrow">{maps.find((map) => map.id === selected.mapId)?.shortName} · {selected.side}</div><h2>{selected.title}</h2></div><button className="close-text" onClick={() => setSelected(null)}>收起</button></div><div className="detail-route"><span className="pin start-pin">S</span><div><small>起始位置座標</small><b>{formatPoint(selected.start)}</b></div><span className="route-arrow">→</span><span className="pin target-pin"><Crosshair size={15} /></span><div><small>生效位置座標</small><b>{formatPoint(selected.impact)}</b></div></div><p>{selected.instructions}</p>{videoOpen && (selected.videoUrl ? <div className="video-box">{isDirectVideo(selected.videoUrl) ? <video src={selected.videoUrl} controls playsInline /> : <iframe src={embedUrl(selected.videoUrl)} title="點位影片" allowFullScreen />}</div> : <div className="video-placeholder">這筆示範資料尚未附影片。</div>)}<button className="primary" onClick={() => setVideoOpen(true)}><Play size={15} /> 查看教學影片</button></section>}
      <footer>LINEUP DATABASE · 示範模式資料只儲存在目前瀏覽器</footer>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null) }}><section className="modal"><div className="modal-head"><div><div className="eyebrow">{modal === 'login' ? 'ADMIN ACCESS' : 'CONTENT MANAGEMENT'}</div><h2>{modal === 'login' ? '管理員登入' : '新增點位'}</h2></div><button className="modal-close" onClick={() => setModal(null)}>×</button></div>
      {modal === 'login' ? <form className="form-stack" onSubmit={async (e) => { e.preventDefault(); const data = new FormData(e.currentTarget); if (supabase) { const { data: result, error } = await supabase.auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) }); if (error) { notify(`登入失敗：${error.message}`); return } const allowed = await verifyAdmin(result.user.id); if (allowed) { setModal(null); notify('Supabase 管理員登入成功') } else { await supabase.auth.signOut(); notify('帳號已登入，但尚未加入管理員名單') } } else if (data.get('email') === 'admin' && data.get('password') === 'lineup123') { setAdmin(true); setModal(null); notify('已進入示範管理員模式') } else notify('示範帳密錯誤：admin / lineup123') }}><label>{supabase ? '管理員 Email' : '示範帳號'}<input name="email" type={supabase ? 'email' : 'text'} defaultValue={supabase ? '' : 'admin'} required /></label><label>密碼<input name="password" type="password" required /></label><button className="primary" type="submit"><ShieldCheck size={15} /> {supabase ? '使用 Supabase 登入' : '登入示範管理介面'}</button><small className="form-help">{supabase ? '先在 Supabase Authentication 建立帳號，並將使用者加入 admin_users。' : '示範帳密：admin / lineup123'}</small></form> : <form className="form-stack" onSubmit={submitLineup}><label>地圖<select value={mapId} onChange={(e) => chooseMap(e.target.value)}>{maps.map((item) => <option key={item.id} value={item.id}>{item.shortName} · {item.name}</option>)}</select></label><label>特務<select value={agentId} onChange={(e) => { setAgentId(e.target.value); setAbilityId(null) }}>{agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>技能<select name="abilityId" key={agentId} defaultValue={agent.abilities[0].id}>{agent.abilities.map((item) => <option key={item.id} value={item.id}>{item.key} · {item.name}</option>)}</select></label><div className="two-fields"><label>攻守<select name="side"><option>進攻</option><option>防守</option></select></label><label>點位標題<input name="title" required placeholder="例如：A 天堂燃燒彈" /></label></div><label>操作說明<textarea name="instructions" rows={3} /></label><label>影片網址<input name="videoUrl" type="url" placeholder="YouTube 或影片網址" /></label><label>影片檔（Supabase Storage）<input name="videoFile" type="file" accept="video/*" /></label><div className="coord-row"><span>起始點：{start ? formatPoint(start) : '尚未在地圖點選'}</span><button type="button" className="outline" onClick={() => startPicking('start')}>在地圖點起始位置</button></div><div className="coord-row"><span>生效點：{impact ? formatPoint(impact) : '尚未在地圖點選'}</span><button type="button" className="outline" onClick={() => startPicking('impact')}>在地圖點生效位置</button></div><button className="primary" type="submit"><Plus size={15} /> 儲存點位</button></form>}
    </section></div>}
    {notice && <div className="toast">{notice}</div>}
  </div>
}

function embedUrl(url: string) { const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/); return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : url }
function isDirectVideo(url: string) { return /\.(mp4|webm|mov)(?:\?|$)/i.test(url) }

function TacticalMap({ mapId }: { mapId: string }) {
  const mapShapes: Record<string, string> = {
    ascent: 'M160 108 L270 68 L340 98 L442 61 L530 92 L626 81 L732 132 L714 208 L782 257 L741 330 L770 380 L701 443 L594 450 L553 495 L464 472 L398 510 L330 466 L250 483 L203 425 L135 421 L113 360 L77 326 L104 250 L65 210 L122 164 Z',
    bind: 'M150 95 L270 70 L340 102 L414 84 L500 118 L618 97 L735 143 L704 218 L770 271 L731 348 L669 356 L635 425 L542 404 L484 468 L411 439 L310 459 L265 402 L192 400 L150 343 L177 272 L133 225 Z',
    haven: 'M150 105 L257 65 L327 96 L398 82 L472 112 L575 89 L674 122 L753 111 L794 181 L733 232 L759 298 L694 335 L705 402 L616 436 L556 493 L474 461 L407 505 L344 451 L261 458 L214 395 L145 410 L112 344 L150 281 L117 216 Z',
    split: 'M164 118 L250 70 L337 98 L402 70 L485 111 L577 94 L681 127 L758 178 L738 242 L787 296 L747 365 L680 387 L654 444 L559 452 L499 493 L417 464 L342 489 L285 433 L204 438 L156 372 L186 301 L127 246 Z',
  }
  return <svg className="tactical-map" viewBox="0 0 900 560" preserveAspectRatio="none" aria-label="示意地圖"><defs><pattern id="mapTexture" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 0h18v18H0z" fill="#222926" /><path d="M0 9h18M9 0v18" stroke="#303833" strokeWidth="1" /></pattern></defs><rect width="900" height="560" fill="#1b211f"/><path d={mapShapes[mapId]} fill="url(#mapTexture)" stroke="#b4a384" strokeWidth="5" strokeLinejoin="round"/><path d="M264 161l70-24 58 35-10 53-56 29-63-29zM491 152l75-15 53 42-15 62-61 20-64-42zM365 310l70-32 66 37 8 69-62 32-75-35zM194 284l52-29 45 32-10 60-60 17-43-39zM594 310l55-31 54 40-7 56-58 23-52-38z" fill="#333a35" stroke="#90866d" strokeWidth="2"/><path d="M93 277h176m19-39 33 58m179-119-21 101m99 72 126 21M382 415l60-70" stroke="#92876c" strokeWidth="10" opacity=".4" strokeLinecap="round"/><text x="350" y="109" fill="#e2dbc9" fontSize="16" letterSpacing="5">{maps.find((item) => item.id === mapId)?.shortName} · 示意底圖</text><text x="280" y="195" fill="#b7ad91" fontSize="13">A SITE</text><text x="520" y="198" fill="#b7ad91" fontSize="13">B SITE</text><text x="417" y="402" fill="#b7ad91" fontSize="13">MID</text></svg>
}
