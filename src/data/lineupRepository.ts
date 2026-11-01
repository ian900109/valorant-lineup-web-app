import type { Lineup } from '../types'
import { seedLineups } from './seed'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'lineup-demo-data-v2'
export interface LineupRepository {
  list(): Promise<Lineup[]>
  save(lineup: Lineup, videoFile?: File, onStatus?: (message: string) => void): Promise<Lineup>
  update(lineup: Lineup, videoFile?: File, onStatus?: (message: string) => void): Promise<Lineup>
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

export class SupabaseLineupRepository implements LineupRepository {
  async list(): Promise<Lineup[]> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    const { data, error } = await supabase.from('lineups').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return Promise.all((data as DbLineup[]).map(async (row) => ({
      id: row.id, mapId: row.map_id, agentId: row.agent_id, abilityId: row.ability_id, title: row.title, site: row.site,
      startLabel: row.start_label, side: row.side, start: { x: row.start_x, y: row.start_y }, impact: { x: row.impact_x, y: row.impact_y },
      instructions: row.instructions, videoUrl: await lineupVideoUrl(row.video_path), videoMode: row.video_mode ?? 'full',
      videoStartSeconds: row.video_start_seconds ?? undefined, videoEndSeconds: row.video_end_seconds ?? undefined, createdAt: row.created_at,
    })))
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
    return { ...lineup, videoUrl: await lineupVideoUrl(row.video_path), createdAt: row.created_at }
  }

  async delete(lineup: Lineup): Promise<void> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
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
