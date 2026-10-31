import type { Ability, Agent, MapRecord } from '../types'
import { supabase } from '../lib/supabase'

type MapRow = { id: string; name: string; short_name: string; image_path: string | null }
type AgentRow = { id: string; name: string; role: string; portrait_path: string | null }
type AbilityRow = { id: string; agent_id: string; key: string; name: string; icon_path: string | null }
const bucket = 'lineup-assets'

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
