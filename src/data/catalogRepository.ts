import type { Ability, Agent, MapRecord } from '../types'
import { supabase } from '../lib/supabase'

type MapRow = { id: string; name: string; short_name: string; image_path: string | null }
type AgentRow = { id: string; name: string; role: string; portrait_path: string | null }
type AbilityRow = { id: string; agent_id: string; key: string; name: string; icon_path: string | null }
const bucket = 'lineup-assets'
const roleNames: Record<string, string> = { Duelist: '決鬥者', Initiator: '先鋒', Controller: '控場者', Sentinel: '守衛' }
const abilityKeys: Record<string, string> = { Ability1: 'Q', Ability2: 'E', Grenade: 'C', Ultimate: 'X' }

function requireSupabase() {
  if (!supabase) throw new Error('Supabase 尚未設定')
  return supabase
}
function imagePath(path: string | null) {
  return path ? requireSupabase().storage.from(bucket).getPublicUrl(path).data.publicUrl : undefined
}
function slug(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
async function uploadImage(file: File, folder: string) {
  const client = requireSupabase()
  if (!file.type.startsWith('image/')) throw new Error('請選擇圖片檔')
  if (file.size > 15 * 1024 * 1024) throw new Error('圖片請小於 15 MB')
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

async function storeCatalogImage(file: File, path: string) {
  const client = requireSupabase()
  if (!file.type.startsWith('image/')) throw new Error('素材來源不是圖片')
  if (file.size > 15 * 1024 * 1024) throw new Error('圖片請小於 15 MB')
  const { error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw error
  return path
}

async function fetchCatalogImage(url: string, name: string) {
  const source = new URL(url)
  if (source.hostname !== 'media.valorant-api.com') throw new Error('素材來源網域不符，已停止匯入')
  const response = await fetch(source)
  if (!response.ok) throw new Error(`下載圖片失敗：${name}（${response.status}）`)
  const blob = await response.blob()
  return new File([blob], `${name}.png`, { type: blob.type || 'image/png' })
}

type ApiMap = { displayName: string; mapUrl: string; displayIcon: string | null }
type ApiAbility = { slot: string; displayName: string; displayIcon: string | null }
type ApiAgent = { uuid: string; displayName: string; displayIcon: string | null; role: { displayName: string } | null; abilities: ApiAbility[]; isPlayableCharacter: boolean }

export async function importAllCatalogAssets(onProgress: (message: string) => void) {
  const client = requireSupabase()
  onProgress('正在讀取 VALORANT 地圖與特務目錄…')
  const [mapsResponse, agentsResponse, localizedAgentsResponse] = await Promise.all([
    fetch('https://valorant-api.com/v1/maps?language=zh-TW'),
    fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US'),
    fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=zh-TW'),
  ])
  if (!mapsResponse.ok || !agentsResponse.ok || !localizedAgentsResponse.ok) throw new Error('VALORANT 素材目錄暫時無法連線，請稍後再試')
  const [mapPayload, agentPayload, localizedAgentPayload] = await Promise.all([mapsResponse.json(), agentsResponse.json(), localizedAgentsResponse.json()]) as [{ data: ApiMap[] }, { data: ApiAgent[] }, { data: ApiAgent[] }]
  const maps = mapPayload.data.filter((map) => map.mapUrl && map.displayIcon)
  const localizedAgents = new Map(localizedAgentPayload.data.map((agent) => [agent.uuid, agent]))
  const agents = agentPayload.data.filter((agent) => agent.isPlayableCharacter && agent.displayIcon).map((agent) => {
    const localized = localizedAgents.get(agent.uuid)
    return { ...agent, role: localized?.role ?? agent.role, abilities: localized?.abilities ?? agent.abilities }
  })
  const [{ data: existingMaps, error: mapReadError }, { data: existingAgents, error: agentReadError }, { data: existingAbilities, error: abilityReadError }] = await Promise.all([
    client.from('maps').select('id'),
    client.from('agents').select('id'),
    client.from('abilities').select('id,agent_id,key'),
  ])
  if (mapReadError) throw mapReadError
  if (agentReadError) throw agentReadError
  if (abilityReadError) throw abilityReadError

  const knownMapIds = new Set((existingMaps as Array<{ id: string }>).map((row) => row.id))
  const knownAgents = new Set((existingAgents as Array<{ id: string }>).map((row) => row.id))
  const knownAbilities = new Map((existingAbilities as Array<{ id: string; agent_id: string; key: string }>).map((row) => [`${row.agent_id}:${row.key}`, row.id]))
  const items: Array<{ kind: 'map'; value: ApiMap } | { kind: 'agent'; value: ApiAgent }> = [
    ...maps.map((value) => ({ kind: 'map' as const, value })),
    ...agents.map((value) => ({ kind: 'agent' as const, value })),
  ]
  const result = { maps: maps.length, agents: agents.length, abilities: 0 }
  let completed = 0
  const failures: string[] = []
  let next = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]
      try {
        if (item.kind === 'map') {
          const routeName = item.value.mapUrl.split('/').filter(Boolean).pop() || item.value.displayName
          const id = slug(routeName)
          if (!id) throw new Error(`${item.value.displayName} 地圖代碼無法識別`)
          const image = await fetchCatalogImage(item.value.displayIcon!, `map-${id}`)
          const image_path = await storeCatalogImage(image, `catalog/maps/${id}.png`)
          const { error } = knownMapIds.has(id)
            ? await client.from('maps').update({ image_path }).eq('id', id)
            : await client.from('maps').insert({ id, name: item.value.displayName, short_name: id.toUpperCase(), image_path })
          if (error) throw error
          knownMapIds.add(id)
        } else {
          const id = slug(item.value.displayName)
          if (!id) throw new Error(`${item.value.displayName} 特務代碼無法識別`)
          const image = await fetchCatalogImage(item.value.displayIcon!, `agent-${id}`)
          const portrait_path = await storeCatalogImage(image, `catalog/agents/${id}/portrait.png`)
          const abilities = item.value.abilities
            .filter((ability) => abilityKeys[ability.slot] && ability.displayIcon)
            .map((ability) => ({ key: abilityKeys[ability.slot], name: ability.displayName, url: ability.displayIcon! }))
            .sort((left, right) => ['Q', 'E', 'C', 'X'].indexOf(left.key) - ['Q', 'E', 'C', 'X'].indexOf(right.key))
          if (abilities.length !== 4) throw new Error(`${item.value.displayName} 的四個技能圖示不完整`)
          const role = roleNames[item.value.role?.displayName ?? ''] ?? item.value.role?.displayName ?? '特務'
          const abilityRows = await Promise.all(abilities.map(async (ability) => {
            const abilityId = knownAbilities.get(`${id}:${ability.key}`) ?? `${id}-${ability.key.toLowerCase()}`
            const file = await fetchCatalogImage(ability.url, `agent-${id}-${ability.key.toLowerCase()}`)
            const icon_path = await storeCatalogImage(file, `catalog/agents/${id}/abilities/${ability.key.toLowerCase()}.png`)
            return { id: abilityId, agent_id: id, key: ability.key, name: ability.name, icon_path }
          }))
          if (knownAgents.has(id)) {
            const { error } = await client.from('agents').update({ portrait_path, role }).eq('id', id)
            if (error) throw error
            for (const ability of abilityRows) {
              if (knownAbilities.has(`${id}:${ability.key}`)) {
                const { error: updateError } = await client.from('abilities').update({ name: ability.name, icon_path: ability.icon_path }).eq('id', ability.id)
                if (updateError) throw updateError
              } else {
                const { error: insertError } = await client.from('abilities').insert(ability)
                if (insertError) throw insertError
                knownAbilities.set(`${id}:${ability.key}`, ability.id)
              }
            }
          } else {
            const { error: agentInsertError } = await client.from('agents').insert({ id, name: item.value.displayName, role, portrait_path })
            if (agentInsertError) throw agentInsertError
            const { error: abilityInsertError } = await client.from('abilities').insert(abilityRows)
            if (abilityInsertError) { await client.from('agents').delete().eq('id', id); throw abilityInsertError }
            knownAgents.add(id)
            for (const ability of abilityRows) knownAbilities.set(`${id}:${ability.key}`, ability.id)
          }
          result.abilities += abilityRows.length
        }
      } catch (error) {
        failures.push(`${item.value.displayName}: ${error instanceof Error ? error.message : '匯入失敗'}`)
      }
      completed++
      onProgress(`同步素材 ${completed}/${items.length}：${item.value.displayName}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()))
  if (failures.length) throw new Error(`${items.length - failures.length}/${items.length} 項完成；${failures.slice(0, 3).join('；')}${failures.length > 3 ? `；另有 ${failures.length - 3} 項失敗` : ''}`)
  return result
}

export async function getCatalog(): Promise<{ maps: MapRecord[]; agents: Agent[] }> {
  const client = requireSupabase()
  const [mapResult, agentResult, abilityResult] = await Promise.all([
    client.from('maps').select('id,name,short_name,image_path').order('short_name'),
    client.from('agents').select('id,name,role,portrait_path').order('name'),
    client.from('abilities').select('id,agent_id,key,name,icon_path').order('key'),
  ])
  if (mapResult.error) throw mapResult.error
  if (agentResult.error) throw agentResult.error
  if (abilityResult.error) throw abilityResult.error
  const maps = (mapResult.data as MapRow[]).map((row) => ({ id: row.id, name: row.name, shortName: row.short_name, imageUrl: imagePath(row.image_path) }))
  const abilities = abilityResult.data as AbilityRow[]
  const agents = (agentResult.data as AgentRow[]).map((row) => ({
    id: row.id, name: row.name, role: row.role, portraitUrl: imagePath(row.portrait_path),
    abilities: abilities.filter((ability) => ability.agent_id === row.id).map((ability): Ability => ({ id: ability.id, key: ability.key, name: ability.name, iconUrl: imagePath(ability.icon_path) })),
  }))
  return { maps, agents }
}

export async function createMap(input: { name: string; shortName: string; image: File }) {
  const client = requireSupabase()
  const id = slug(input.shortName)
  if (!id) throw new Error('地圖代碼請使用英文或數字，例如 LOTUS')
  const image_path = await uploadImage(input.image, `maps/${id}`)
  const { error } = await client.from('maps').insert({ id, name: input.name.trim(), short_name: input.shortName.trim().toUpperCase(), image_path })
  if (error) throw error
}

export async function updateMapImage(id: string, file: File) {
  const client = requireSupabase()
  const image_path = await uploadImage(file, `maps/${id}`)
  const { error } = await client.from('maps').update({ image_path }).eq('id', id)
  if (error) throw error
}

export async function updateAgentPortrait(id: string, file: File) {
  const client = requireSupabase()
  const portrait_path = await uploadImage(file, `agents/${id}/portrait`)
  const { error } = await client.from('agents').update({ portrait_path }).eq('id', id)
  if (error) throw error
}

export async function updateAbilityIcon(id: string, file: File) {
  const client = requireSupabase()
  const icon_path = await uploadImage(file, `abilities/${id}`)
  const { error } = await client.from('abilities').update({ icon_path }).eq('id', id)
  if (error) throw error
}

async function bundledDemoImage(name: string) {
  const response = await fetch(`/assets/valorant-demo/${name}`)
  if (!response.ok) throw new Error(`無法讀取範例圖片：${name}`)
  return new File([await response.blob()], name, { type: 'image/png' })
}

export async function importDemoAssets() {
  await updateMapImage('ascent', await bundledDemoImage('ascent-map.png'))
  await updateAgentPortrait('brimstone', await bundledDemoImage('brimstone-portrait.png'))
  await updateAbilityIcon('incendiary', await bundledDemoImage('brimstone-ability1.png'))
  await updateAbilityIcon('sky-smoke', await bundledDemoImage('brimstone-ability2.png'))
  await updateAbilityIcon('stim-beacon', await bundledDemoImage('brimstone-grenade.png'))
  await updateAbilityIcon('orbital-strike', await bundledDemoImage('brimstone-ultimate.png'))
}

export async function deleteMap(id: string) {
  const client = requireSupabase()
  const { count, error: usageError } = await client.from('lineups').select('id', { count: 'exact', head: true }).eq('map_id', id)
  if (usageError) throw usageError
  if (count) throw new Error(`這張地圖還有 ${count} 個點位在使用，請先移除相關點位`)
  const { data: map, error: mapError } = await client.from('maps').select('image_path').eq('id', id).single()
  if (mapError) throw mapError
  const { error } = await client.from('maps').delete().eq('id', id)
  if (error) throw error
  if (map.image_path) {
    const { error: storageError } = await client.storage.from(bucket).remove([map.image_path])
    if (storageError) throw new Error(`地圖已刪除，但平面圖清理失敗：${storageError.message}`)
  }
}

export async function deleteAgent(id: string) {
  const client = requireSupabase()
  const { count, error: usageError } = await client.from('lineups').select('id', { count: 'exact', head: true }).eq('agent_id', id)
  if (usageError) throw usageError
  if (count) throw new Error(`這位特務還有 ${count} 個點位在使用，請先移除相關點位`)
  const [{ data: agent, error: agentReadError }, { data: abilities, error: abilityReadError }] = await Promise.all([
    client.from('agents').select('portrait_path').eq('id', id).single(),
    client.from('abilities').select('icon_path').eq('agent_id', id),
  ])
  if (agentReadError) throw agentReadError
  if (abilityReadError) throw abilityReadError
  const { error } = await client.from('agents').delete().eq('id', id)
  if (error) throw error
  const paths = [agent.portrait_path, ...abilities.map((ability) => ability.icon_path)].filter((path): path is string => Boolean(path))
  if (paths.length) {
    const { error: storageError } = await client.storage.from(bucket).remove(paths)
    if (storageError) throw new Error(`特務已刪除，但部分素材清理失敗：${storageError.message}`)
  }
}

export async function createAgent(input: {
  name: string; role: string; portrait: File
  abilities: Array<{ key: string; name: string; icon: File }>
}) {
  const client = requireSupabase()
  const id = slug(input.name)
  if (!id) throw new Error('特務名稱無法轉成識別碼')
  if (input.abilities.length !== 4 || input.abilities.some((ability) => !ability.name.trim() || !ability.icon)) throw new Error('請填寫四個技能名稱並上傳各自圖示')
  const portrait_path = await uploadImage(input.portrait, `agents/${id}/portrait`)
  const abilities = await Promise.all(input.abilities.map(async (ability) => ({
    id: `${id}-${ability.key.toLowerCase()}`, agent_id: id, key: ability.key, name: ability.name.trim(), icon_path: await uploadImage(ability.icon, `agents/${id}/abilities`),
  })))
  const { error: agentError } = await client.from('agents').insert({ id, name: input.name.trim(), role: input.role.trim(), portrait_path })
  if (agentError) throw agentError
  const { error: abilitiesError } = await client.from('abilities').insert(abilities)
  if (abilitiesError) {
    await client.from('agents').delete().eq('id', id)
    throw abilitiesError
  }
}
