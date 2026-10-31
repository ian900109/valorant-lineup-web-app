import type { Lineup } from '../types'
import { seedLineups } from './seed'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'lineup-demo-data-v2'
export interface LineupRepository {
  list(): Promise<Lineup[]>
  save(lineup: Lineup, videoFile?: File): Promise<Lineup>
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

  async delete(lineup: Lineup): Promise<void> {
    const current = await this.list()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current.filter((item) => item.id !== lineup.id)))
  }
}

type DbLineup = {
  id: string; map_id: string; agent_id: string; ability_id: string; title: string; site: string; start_label: string; side: '進攻' | '防守';
  start_x: number; start_y: number; impact_x: number; impact_y: number; instructions: string; video_path: string | null; created_at: string
}

export class SupabaseLineupRepository implements LineupRepository {
  async list(): Promise<Lineup[]> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    const { data, error } = await supabase.from('lineups').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return (data as DbLineup[]).map((row) => ({
      id: row.id, mapId: row.map_id, agentId: row.agent_id, abilityId: row.ability_id, title: row.title, site: row.site,
      startLabel: row.start_label, side: row.side, start: { x: row.start_x, y: row.start_y }, impact: { x: row.impact_x, y: row.impact_y },
      instructions: row.instructions, videoUrl: row.video_path ?? undefined, createdAt: row.created_at,
    }))
  }

  async save(lineup: Lineup, videoFile?: File): Promise<Lineup> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    let videoPath: string | null = lineup.videoUrl || null
    if (videoFile) {
      const ext = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4'
      const path = `lineups/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('lineup-assets').upload(path, videoFile, { contentType: videoFile.type, upsert: false })
      if (uploadError) throw uploadError
      videoPath = supabase.storage.from('lineup-assets').getPublicUrl(path).data.publicUrl
    }
    const { data: userResult } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('lineups').insert({
      map_id: lineup.mapId, agent_id: lineup.agentId, ability_id: lineup.abilityId, title: lineup.title, site: lineup.site,
      start_label: lineup.startLabel, side: lineup.side, start_x: lineup.start.x, start_y: lineup.start.y,
      impact_x: lineup.impact.x, impact_y: lineup.impact.y, instructions: lineup.instructions,
      video_path: videoPath, created_by: userResult.user?.id,
    }).select('*').single()
    if (error) throw error
    const row = data as DbLineup
    return { ...lineup, id: row.id, videoUrl: row.video_path ?? undefined, createdAt: row.created_at }
  }

  async delete(lineup: Lineup): Promise<void> {
    if (!supabase) throw new Error('尚未設定 Supabase 連線')
    const marker = '/storage/v1/object/public/lineup-assets/'
    if (lineup.videoUrl) {
      try {
        const path = new URL(lineup.videoUrl).pathname.split(marker)[1]
        if (path) {
          const { error: storageError } = await supabase.storage.from('lineup-assets').remove([decodeURIComponent(path)])
          if (storageError) throw storageError
        }
      } catch (error) {
        if (error instanceof Error && error.message !== 'Invalid URL') throw error
      }
    }
    const { error } = await supabase.from('lineups').delete().eq('id', lineup.id)
    if (error) throw error
  }
}

export const lineupRepository: LineupRepository = supabase ? new SupabaseLineupRepository() : new LocalLineupRepository()
