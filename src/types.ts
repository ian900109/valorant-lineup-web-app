export type MapRecord = { id: string; name: string; shortName: string; imageUrl?: string }
export type Ability = { id: string; key: string; name: string; iconUrl?: string }
export type Agent = { id: string; name: string; role: string; portraitUrl?: string; abilities: Ability[] }
export type Lineup = {
  id: string
  mapId: string
  agentId: string
  abilityId: string
  title: string
  site: string
  startLabel: string
  side: '進攻' | '防守'
  start: { x: number; y: number }
  impact: { x: number; y: number }
  instructions: string
  videoUrl?: string
  createdAt: string
}
