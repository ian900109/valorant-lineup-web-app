import type { Agent, Lineup, MapRecord } from '../types'

export const maps: MapRecord[] = [
  { id: 'ascent', name: '亞海懸城', shortName: 'ASCENT' },
  { id: 'bind', name: '劫境之地', shortName: 'BIND' },
  { id: 'haven', name: '隱世修所', shortName: 'HAVEN' },
  { id: 'split', name: '雙塔迷城', shortName: 'SPLIT' },
]

const makeAbility = (id: string, key: string, name: string) => ({ id, key, name })
export const agents: Agent[] = [
  { id: 'brimstone', name: 'Brimstone', role: '控場者', abilities: [makeAbility('incendiary', 'Q', '燃燒彈'), makeAbility('sky-smoke', 'E', '煙幕雲'), makeAbility('stim-beacon', 'C', '激勵信標'), makeAbility('orbital-strike', 'X', '天國兵器')] },
  { id: 'sova', name: 'Sova', role: '先鋒', abilities: [makeAbility('shock-bolt', 'Q', '震擊之箭'), makeAbility('recon-bolt', 'E', '偵查之箭'), makeAbility('owl-drone', 'C', '梟型無人機'), makeAbility('hunters-fury', 'X', '狂獵之怒')] },
  { id: 'viper', name: 'Viper', role: '控場者', abilities: [makeAbility('poison-cloud', 'Q', '毒霧雲'), makeAbility('toxic-screen', 'E', '劇毒幕牆'), makeAbility('snake-bite', 'C', '蛇咬'), makeAbility('vipers-pit', 'X', '蝮蛇領域')] },
  { id: 'killjoy', name: 'Killjoy', role: '守衛', abilities: [makeAbility('alarmbot', 'Q', '警報機器人'), makeAbility('turret', 'E', '砲塔'), makeAbility('nanoswarm', 'C', '奈米蜂群'), makeAbility('lockdown', 'X', '全面封鎖')] },
  { id: 'cypher', name: 'Cypher', role: '守衛', abilities: [makeAbility('cyber-cage', 'Q', '網路牢籠'), makeAbility('spycam', 'E', '監視攝影機'), makeAbility('trapwire', 'C', '陷阱線'), makeAbility('neural-theft', 'X', '神經竊取')] },
  { id: 'fade', name: 'Fade', role: '先鋒', abilities: [makeAbility('seize', 'Q', '纏縛'), makeAbility('haunt', 'E', '夜神視界'), makeAbility('prowler', 'C', '潛獵'), makeAbility('nightfall', 'X', '夜幕降臨')] },
]

export const seedLineups: Lineup[] = [
  { id: 'demo-1', mapId: 'ascent', agentId: 'brimstone', abilityId: 'incendiary', title: 'A 天堂燃燒彈', site: 'A 點 · 天堂', startLabel: 'A 大門口', side: '進攻', start: { x: .23, y: .65 }, impact: { x: .72, y: .32 }, instructions: '站在 A 大門入口牆角，瞄準天堂屋頂右側瓦片接縫。跳投，在最高點放開燃燒彈。', createdAt: '2026-10-28' },
  { id: 'demo-2', mapId: 'ascent', agentId: 'sova', abilityId: 'recon-bolt', title: 'B 市集偵查箭', site: 'B 點 · 市集', startLabel: 'B 連接道', side: '進攻', start: { x: .3, y: .36 }, impact: { x: .67, y: .69 }, instructions: '站在 B 連接道木箱旁。兩格蓄力加一次彈跳，瞄準屋簷交點發射。', createdAt: '2026-10-28' },
  { id: 'demo-3', mapId: 'ascent', agentId: 'viper', abilityId: 'snake-bite', title: 'A 樂園延遲燃燒', site: 'A 點 · 樂園', startLabel: 'A 大門口', side: '防守', start: { x: .23, y: .65 }, impact: { x: .32, y: .43 }, instructions: '靠在 A 點入口牆邊，瞄準屋頂缺口輕按投擲。落點覆蓋樂園入口。', createdAt: '2026-10-28' },
  { id: 'demo-4', mapId: 'bind', agentId: 'viper', abilityId: 'snake-bite', title: 'B 長道封鎖', site: 'B 點 · 後場', startLabel: 'B 長道入口', side: '進攻', start: { x: .28, y: .55 }, impact: { x: .68, y: .44 }, instructions: '站在 B 長道入口牆邊，瞄準招牌左上角跳投。', createdAt: '2026-10-28' },
]
