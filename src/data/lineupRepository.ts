import type { Lineup } from '../types'
import { seedLineups } from './seed'

const STORAGE_KEY = 'lineup-demo-data-v2'
export interface LineupRepository {
  list(): Promise<Lineup[]>
  save(lineup: Lineup): Promise<void>
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

  async save(lineup: Lineup): Promise<void> {
    const current = await this.list()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([lineup, ...current]))
  }
}
