import type { Lineup, LineupImage } from '../types'
import { seedLineups } from './seed'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'lineup-demo-data-v2'
export interface LineupRepository {
  list(): Promise<Lineup[]>
  save(lineup: Lineup, videoFile?: File, onStatus?: (message: string) => void): Promise<Lineup>
  update(lineup: Lineup, videoFile?: File, onStatus?: (message: string) => void): Promise<Lineup>
  uploadImages(lineupId: string, files: File[], onStatus?: (message: string) => void): Promise<void>
  deleteImage(image: LineupImage): Promise<void>
  delete(lineup: Lineup): Promise<void>
}

export class LocalLineupRepository implements LineupRepository {
  async list(): Promise<Lineup[]> {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedLineups))
      return seedLineups
    }
    try { return JSON.parse(saved) as Lineup[] } catch { return seedLineups }
  }

  async save(lineup: Lineup, videoFile?: File): Promise<Lineup> {
    const current = await this.list()
    const saved = videoFile ? { ...lineup, videoUrl: URL.createObjectURL(videoFile) } : lineup
    localStorage.setItem(STORAGE_KEY, JSON.stringify([saved, ...current]))
    return saved
  }

  async update(lineup: Lineup, videoFile?: File): Promise<Lineup> {
    const current = await this.list()
    const saved = videoFile ? { ...lineup, videoUrl: URL.createObjectURL(videoFile) } : lineup
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current.map((item) => item.id === lineup.id ? saved : item)))
    return saved
  }

  async delete(lineup: Lineup): Promise<void> {
    const current = await this.list()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current.filter((item) => item.id !== lineup.id)))
  }

  async uploadImages(): Promise<void> { throw new Error('截圖上傳需要連接 Supabase；示範模式不會將截圖儲存到資料庫') }
  async deleteImage(): Promise<void> { throw new Error('截圖管理需要連接 Supabase') }
}

type DbLineup = {
  id: string; map_id: string; agent_id: string; ability_id: string; title: string; site: string; start_label: string; side: '進攻' | '防守';
  start_x: number; start_y: number; impact_x: number; impact_y: number; instructions: string; video_path: string | null;
  video_mode: 'full' | 'clip' | null; video_start_seconds: number | null; video_end_seconds: number | null; created_at: string
}

function lineupAssetPath(value: string | null) {
  if (!value) return null
  const markers = ['/storage/v1/object/public/lineup-assets/', '/storage/v1/object/sign/lineup-assets/']
  try {
    const pathname = new URL(value).pathname
    for (const marker of markers) {
      const markerIndex = pathname.indexOf(marker)
      if (markerIndex >= 0) return decodeURIComponent(pathname.slice(markerIndex + marker.length))
    }
    return null
  } catch {
    return value.startsWith('lineups/') ? value : null
  }
}

async function lineupVideoUrl(value: string | null) {
  if (!value || !supabase) return value ?? undefined
  const path = lineupAssetPath(value)
  if (!path) return value
  const { data, error } = await supabase.storage.from('lineup-assets').createSignedUrl(path, 60 * 60 * 24)
  if (error) throw error
  return data.signedUrl
}

async function resolveLineupVideo(value: string | null) {
  try {
    return { videoUrl: await lineupVideoUrl(value), videoUnavailable: false }
  } catch (error) {
    console.warn('Could not load lineup video; lineup data will remain available:', error)
    return { videoUrl: undefined, videoUnavailable: true }
  }
}

export class SupabaseLineupRepository implements LineupRepository {
  async list(): Promise<Lineup[]> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    const { data, error } = await supabase.from('lineups').select('*').order('created_at', { ascending: false })
    if (error) throw error
    const rows = data as DbLineup[]
    const imagesByLineup = new Map<string, LineupImage[]>()
    if (rows.length) {
      const { data: imageRows, error: imageError } = await supabase.from('lineup_images').select('*').in('lineup_id', rows.map((row) => row.id)).order('position')
      if (imageError) {
        console.warn('Could not load lineup screenshots; lineup data remains available:', imageError)
      } else {
        await Promise.all((imageRows ?? []).map(async (image: { id: string; lineup_id: string; storage_path: string; position: number }) => {
          const { data: signed, error: signedError } = await supabase!.storage.from('lineup-assets').createSignedUrl(image.storage_path, 60 * 60 * 24)
          const list = imagesByLineup.get(image.lineup_id) ?? []
          list.push({ id: image.id, position: image.position, url: signedError ? undefined : signed.signedUrl, unavailable: Boolean(signedError) })
          imagesByLineup.set(image.lineup_id, list)
        }))
      }
    }
    return Promise.all(rows.map(async (row) => {
      const video = await resolveLineupVideo(row.video_path)
      return {
        id: row.id, mapId: row.map_id, agentId: row.agent_id, abilityId: row.ability_id, title: row.title, site: row.site,
        startLabel: row.start_label, side: row.side, start: { x: row.start_x, y: row.start_y }, impact: { x: row.impact_x, y: row.impact_y },
        instructions: row.instructions, images: imagesByLineup.get(row.id) ?? [], ...video, videoMode: row.video_mode ?? 'full',
        videoStartSeconds: row.video_start_seconds ?? undefined, videoEndSeconds: row.video_end_seconds ?? undefined, createdAt: row.created_at,
      }
    }))
  }

  async uploadImages(lineupId: string, files: File[], onStatus?: (message: string) => void): Promise<void> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    if (!files.length) return
    const { data: existing, error: listError } = await supabase.from('lineup_images').select('position').eq('lineup_id', lineupId).order('position', { ascending: false }).limit(1)
    if (listError) throw new Error('截圖資料表尚未設定，請先在 Supabase 執行 lineup_screenshots SQL')
    const startAt = (existing?.[0]?.position ?? -1) + 1
    const uploaded: { path: string; position: number }[] = []
    try {
      for (const [index, file] of files.entries()) {
        onStatus?.(`正在上傳截圖 ${index + 1}/${files.length}…`)
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp'
        const path = `lineups/${lineupId}/screenshots/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from('lineup-assets').upload(path, file, { contentType: file.type, upsert: false })
        if (error) throw error
        uploaded.push({ path, position: startAt + index })
      }
      const { error } = await supabase.from('lineup_images').insert(uploaded.map((item) => ({ lineup_id: lineupId, storage_path: item.path, position: item.position })))
      if (error) throw error
    } catch (error) {
      if (uploaded.length) await supabase.storage.from('lineup-assets').remove(uploaded.map((item) => item.path))
      throw error
    }
  }

  async deleteImage(image: LineupImage): Promise<void> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    const { data, error } = await supabase.from('lineup_images').select('storage_path').eq('id', image.id).single()
    if (error) throw error
    const { error: storageError } = await supabase.storage.from('lineup-assets').remove([data.storage_path])
    if (storageError) throw storageError
    const { error: rowError } = await supabase.from('lineup_images').delete().eq('id', image.id)
    if (rowError) throw rowError
  }

  async save(lineup: Lineup, videoFile?: File, onStatus?: (message: string) => void): Promise<Lineup> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    let videoPath: string | null = lineup.videoUrl || null
    if (videoFile) {
      onStatus?.('正在上傳影片…')
      const ext = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4'
      const path = `lineups/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('lineup-assets').upload(path, videoFile, { contentType: videoFile.type, upsert: false })
      if (uploadError) throw uploadError
      videoPath = path
    }
    onStatus?.('正在儲存點位內容…')
    const { data: userResult } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('lineups').insert({
      map_id: lineup.mapId, agent_id: lineup.agentId, ability_id: lineup.abilityId, title: lineup.title, site: lineup.site,
      start_label: lineup.startLabel, side: lineup.side, start_x: lineup.start.x, start_y: lineup.start.y,
      impact_x: lineup.impact.x, impact_y: lineup.impact.y, instructions: lineup.instructions,
      video_path: videoPath, video_mode: lineup.videoMode ?? 'full',
      video_start_seconds: lineup.videoMode === 'clip' ? lineup.videoStartSeconds ?? null : null,
      video_end_seconds: lineup.videoMode === 'clip' ? lineup.videoEndSeconds ?? null : null,
      created_by: userResult.user?.id,
    }).select('*').single()
    if (error) throw error
    const row = data as DbLineup
    return { ...lineup, id: row.id, videoUrl: row.video_path ?? undefined, createdAt: row.created_at }
  }

  async update(lineup: Lineup, videoFile?: File, onStatus?: (message: string) => void): Promise<Lineup> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    const previousPath = lineupAssetPath(lineup.videoUrl ?? null)
    let videoPath: string | null = previousPath ?? lineup.videoUrl ?? null
    let uploadedPath: string | null = null
    if (videoFile) {
      onStatus?.('正在上傳影片…')
      const ext = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4'
      uploadedPath = `lineups/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('lineup-assets').upload(uploadedPath, videoFile, { contentType: videoFile.type, upsert: false })
      if (uploadError) throw uploadError
      videoPath = uploadedPath
    }
    onStatus?.('正在儲存點位內容…')
    const { data, error } = await supabase.from('lineups').update({
      map_id: lineup.mapId, agent_id: lineup.agentId, ability_id: lineup.abilityId, title: lineup.title, site: lineup.site,
      start_label: lineup.startLabel, side: lineup.side, start_x: lineup.start.x, start_y: lineup.start.y,
      impact_x: lineup.impact.x, impact_y: lineup.impact.y, instructions: lineup.instructions,
      video_path: videoPath, video_mode: lineup.videoMode ?? 'full',
      video_start_seconds: lineup.videoMode === 'clip' ? lineup.videoStartSeconds ?? null : null,
      video_end_seconds: lineup.videoMode === 'clip' ? lineup.videoEndSeconds ?? null : null,
    }).eq('id', lineup.id).select('*').single()
    if (error) {
      if (uploadedPath) await supabase.storage.from('lineup-assets').remove([uploadedPath])
      throw error
    }
    if (previousPath && previousPath !== videoPath) {
      const { error: removeError } = await supabase.storage.from('lineup-assets').remove([previousPath])
      if (removeError) console.error('Could not remove replaced lineup video:', removeError)
    }
    const row = data as DbLineup
    const video = await resolveLineupVideo(row.video_path)
    return { ...lineup, ...video, createdAt: row.created_at }
  }

  async delete(lineup: Lineup): Promise<void> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    const { data: imageRows, error: imageError } = await supabase.from('lineup_images').select('storage_path').eq('lineup_id', lineup.id)
    if (!imageError && imageRows?.length) await supabase.storage.from('lineup-assets').remove(imageRows.map((row: { storage_path: string }) => row.storage_path))
    const path = lineupAssetPath(lineup.videoUrl ?? null)
    if (path) {
      const { error: storageError } = await supabase.storage.from('lineup-assets').remove([path])
      if (storageError) throw storageError
    }
    const { error } = await supabase.from('lineups').delete().eq('id', lineup.id)
    if (error) throw error
  }
}

export const lineupRepository: LineupRepository = supabase ? new SupabaseLineupRepository() : new LocalLineupRepository()
