import { useState } from 'react'
import { CloudUpload, ImagePlus, Trash2, Upload } from 'lucide-react'
import type { Agent, MapRecord } from '../types'
import { createAgent, createMap, deleteAgent, deleteMap, importAllCatalogAssets, updateAbilityIcon, updateAgentPortrait, updateMapImage } from '../data/catalogRepository'

type Props = { section: 'maps' | 'agents'; maps: MapRecord[]; agents: Agent[]; admin: boolean; onRefresh: () => Promise<void>; notify: (message: string) => void }
const keys = ['Q', 'E', 'C', 'X']

export default function CatalogManager({ section, maps, agents, admin, onRefresh, notify }: Props) {
  const [busy, setBusy] = useState(false)
  const [shortName, setShortName] = useState('')
  const [syncProgress, setSyncProgress] = useState('')

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    try { await action(); await onRefresh(); notify(success) }
    catch (error) { notify(`素材操作失敗：${error instanceof Error ? error.message : '請檢查管理員權限與素材'}`) }
    finally { setBusy(false) }
  }
  async function submitMap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const image = form.get('image')
    if (!(image instanceof File) || !image.size) { notify('請選擇地圖平面圖'); return }
    await run(() => createMap({ name: String(form.get('name')), shortName: String(form.get('shortName')), image }), '地圖與平面圖已新增')
    formElement.reset(); setShortName('')
  }
  async function submitAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const portrait = form.get('portrait')
    if (!(portrait instanceof File) || !portrait.size) { notify('請選擇特務頭像'); return }
    const abilities = keys.map((key) => ({ key, name: String(form.get(`ability-${key}`) || ''), icon: form.get(`icon-${key}`) }))
    if (abilities.some((item) => !item.name.trim() || !(item.icon instanceof File) || !item.icon.size)) { notify('請填寫四個技能名稱，並為每個技能選擇圖示'); return }
    await run(() => createAgent({ name: String(form.get('name')), role: String(form.get('role')), portrait, abilities: abilities as Array<{ key: string; name: string; icon: File }> }), '特務頭像和四個技能圖示已新增')
    formElement.reset()
  }
  async function syncAllAssets() {
    if (!window.confirm('同步所有地圖、特務與四個技能圖示到 Supabase？現有素材圖片會更新，點位資料不會刪除。')) return
    setBusy(true); setSyncProgress('正在準備素材目錄…')
    try {
      const result = await importAllCatalogAssets(setSyncProgress)
      await onRefresh()
      notify(`素材同步完成：${result.maps} 張地圖、${result.agents} 位特務、${result.abilities} 個技能圖示`)
    } catch (error) {
      await onRefresh().catch(() => {})
      notify(`素材同步未完全完成：${error instanceof Error ? error.message : '請檢查 Supabase 權限與網路'}`)
    } finally { setBusy(false); setSyncProgress('') }
  }
  function removeMap(map: MapRecord) {
    if (!admin) return
    if (maps.length <= 1) { notify('至少要保留一張地圖'); return }
    if (window.confirm(`確定刪除「${map.name}」及其平面圖？若仍有點位使用，系統會阻止刪除。`)) void run(() => deleteMap(map.id), `地圖「${map.name}」已刪除`)
  }
  function removeAgent(agent: Agent) {
    if (!admin) return
    if (agents.length <= 1) { notify('至少要保留一位特務'); return }
    if (window.confirm(`確定刪除「${agent.name}」及其四個技能資料與圖示？若仍有點位使用，系統會阻止刪除。`)) void run(() => deleteAgent(agent.id), `特務「${agent.name}」與技能已刪除`)
  }

  return <div className="catalog-manager">
    {section === 'maps' ? <div className="catalog-content">
      <h3>地圖平面圖 <span className="catalog-count">{maps.length} 張地圖</span></h3>
      {admin && <div className="demo-import"><div><b>同步完整 VALORANT 素材目錄</b><small>{syncProgress || '新增目錄缺少的地圖與特務，並更新所有地圖平面圖、頭像及技能圖示'}</small></div><button className="primary" type="button" disabled={busy} onClick={() => void syncAllAssets()}><CloudUpload size={15} /> {busy ? '同步中…' : '同步所有圖片'}</button></div>}
      <div className="asset-list">{maps.map((map) => <article className="asset-card map-asset" key={map.id}>
        <div className="map-thumb">{map.imageUrl ? <img src={map.imageUrl} alt={`${map.name} 平面圖`} /> : <span><ImagePlus size={18} /> 尚未上傳平面圖</span>}</div>
        <div className="asset-info"><b>{map.shortName} · {map.name}</b><small>{map.imageUrl ? '已有地圖圖片' : '尚未上傳平面圖'}</small>
          {admin && <div className="asset-actions"><label className="file-action"><Upload size={14} /> {map.imageUrl ? '更換平面圖' : '上傳平面圖'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => updateMapImage(map.id, file), `${map.name} 平面圖已更新`); event.currentTarget.value = '' }} /></label><button className="delete-asset" type="button" disabled={busy} onClick={() => removeMap(map)}><Trash2 size={13} /> 刪除</button></div>}
        </div>
      </article>)}</div>
      {admin && <form className="asset-form" onSubmit={submitMap}><h3>新增地圖</h3><div className="two-fields"><label>地圖名稱<input name="name" required placeholder="例如：蓮華古城" /></label><label>地圖代碼<input name="shortName" required value={shortName} onChange={(e) => setShortName(e.target.value.toUpperCase())} placeholder="例如：LOTUS" /></label></div><label>平面圖檔案<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required /></label><small>支援 PNG、JPG、WebP，單張圖片上限 15 MB。</small><button className="primary" type="submit" disabled={busy}><ImagePlus size={15} /> 新增地圖</button></form>}
    </div> : <div className="catalog-content">
      <h3>特務與技能圖示 <span className="catalog-count">{agents.length} 位特務</span></h3>
      <div className="asset-list">{agents.map((agent) => <article className="asset-card agent-asset" key={agent.id}>
        <div className="agent-asset-head">{agent.portraitUrl ? <img src={agent.portraitUrl} alt={`${agent.name} 頭像`} /> : <span className="asset-missing">{agent.name.slice(0, 1)}</span>}<div><b>{agent.name}</b><small>{agent.role}</small>
          {admin && <div className="asset-actions"><label className="file-action">更換頭像<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => updateAgentPortrait(agent.id, file), `${agent.name} 頭像已更新`); event.currentTarget.value = '' }} /></label><button className="delete-asset" type="button" disabled={busy} onClick={() => removeAgent(agent)}><Trash2 size={13} /> 刪除特務</button></div>}
        </div></div>
        <div className="ability-assets">{agent.abilities.map((ability) => <div className="ability-asset" key={ability.id}>{ability.iconUrl ? <img src={ability.iconUrl} alt="" /> : <span>{ability.key}</span>}<small>{ability.key} · {ability.name}</small>{admin && <label title={`上傳 ${ability.name} 圖示`}>＋<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => updateAbilityIcon(ability.id, file), `${agent.name} · ${ability.name} 圖示已更新`); event.currentTarget.value = '' }} /></label>}</div>)}</div>
      </article>)}</div>
      {admin && <form className="asset-form" onSubmit={submitAgent}><h3>新增特務與四個技能</h3><div className="two-fields"><label>特務名稱<input name="name" required placeholder="例如：Clove" /></label><label>角色定位<input name="role" required placeholder="控場者" /></label></div><label>特務頭像<input name="portrait" type="file" accept="image/png,image/jpeg,image/webp" required /></label><div className="new-abilities">{keys.map((key) => <div className="new-ability-row" key={key}><b>{key}</b><input name={`ability-${key}`} required placeholder={`${key} 技能名稱`} /><input name={`icon-${key}`} type="file" accept="image/png,image/jpeg,image/webp" required aria-label={`${key} 技能圖示`} /></div>)}</div><small>每張圖片上限 15 MB。上傳後儲存在 Supabase Storage。</small><button className="primary" type="submit" disabled={busy}><ImagePlus size={15} /> 新增特務</button></form>}
    </div>}
  </div>
}
