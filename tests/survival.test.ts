import { describe, expect, it } from 'vitest'
import {
  formatRelativeTime,
  parseSurvivalWaves,
  parseTimeMs,
  parseWaveTime,
  serializeSurvivalWaves,
  unitAddFirstAtSec,
  formatWaveUnits,
} from '@/game/survival'
import { parseSpawnUnits, serializeSpawnUnits } from '@/game/spawnUnits'
import { createNewMap } from '@/game/mapFactory'
import { validateMap } from '@/game/validation'
import { parseTmx } from '@/tmx/parse'
import { resolveTsx } from '@/game/builtin'

describe('survivalWaves 解析 (g.java)', () => {
  it('解析相对时间、说明、选项与波次单位', () => {
    const text = [
      '+0:30 准备阶段',
      '+1:30 第一波 [lockSpawn] - 4 tank, 2 scout',
      '+2:00 第二波 - 3 heavyTank, 1 helicopter',
      '![unlockSpawn]',
    ].join('\n')
    const waves = parseSurvivalWaves(text)
    expect(waves).toHaveLength(4)
    expect(waves[0].relativeSec).toBe(30)
    expect(waves[0].absoluteSec).toBe(30)
    expect(waves[0].label).toBe('准备阶段')
    expect(waves[0].units).toEqual([])

    expect(waves[1].relativeSec).toBe(90)
    expect(waves[1].absoluteSec).toBe(120)
    expect(waves[1].options).toContain('lockSpawn')
    expect(waves[1].units).toEqual([
      { count: 4, unit: 'tank' },
      { count: 2, unit: 'scout' },
    ])

    expect(waves[2].absoluteSec).toBe(240)
    expect(waves[3].relativeSec).toBeNull()
    expect(waves[3].options).toContain('unlockSpawn')
    expect(waves[3].absoluteSec).toBe(240)
  })

  it('往返序列化保持语义', () => {
    const text = '+0:56 绿茵 - 1 heavyTank, 2 hoverTank\n+0:42 波1 - 3 tank'
    const waves = parseSurvivalWaves(text)
    const again = parseSurvivalWaves(serializeSurvivalWaves(waves))
    expect(again.map((w) => ({ a: w.absoluteSec, u: formatWaveUnits(w.units), l: w.label }))).toEqual(
      waves.map((w) => ({ a: w.absoluteSec, u: formatWaveUnits(w.units), l: w.label })),
    )
  })

  it('坏行记录 error 而不抛异常', () => {
    const waves = parseSurvivalWaves('not a wave\n+10 ok')
    expect(waves[0].error).toBeTruthy()
    expect(waves[1].label).toBe('ok')
    expect(waves[1].absoluteSec).toBe(10)
  })

  it('时间工具', () => {
    expect(parseWaveTime('1:30')).toBe(90)
    expect(parseWaveTime('45')).toBe(45)
    expect(formatRelativeTime(90)).toBe('1:30')
    expect(parseTimeMs('5s')).toBe(5000)
    expect(parseTimeMs('500ms')).toBe(500)
    expect(parseTimeMs('1200')).toBe(1200)
  })
})

describe('spawnUnits 单位列表', () => {
  it('解析 name*count 与选项', () => {
    const list = parseSpawnUnits('tank*3, heavyTank, scout*2(gridAlign=true)')
    expect(list).toEqual([
      { unit: 'tank', count: 3, opts: undefined },
      { unit: 'heavyTank', count: 1, opts: undefined },
      { unit: 'scout', count: 2, opts: 'gridAlign=true' },
    ])
    expect(serializeSpawnUnits(list)).toBe('tank*3, heavyTank, scout*2(gridAlign=true)')
  })
})

describe('unitAdd 首次时间', () => {
  it('仅 warmup', () => {
    expect(unitAddFirstAtSec({ warmup: '620s' })).toBe(620)
  })
  it('delay + warmup', () => {
    expect(unitAddFirstAtSec({ delay: '10s', warmup: '5s' })).toBe(15)
  })
  it('activatedBy 返回 null', () => {
    expect(unitAddFirstAtSec({ activatedBy: 'w', warmup: '10s' })).toBeNull()
  })
})

describe('新建 survival 地图', () => {
  it('带 survivalWaves / attack_point / team_info', () => {
    const map = createNewMap({ width: 40, height: 40, mapType: 'survival' })
    const issues = validateMap(map)
    // 不应再报 survival 缺 attack_point / ai team / waves（已预填）
    expect(issues.some((i) => i.id === 'survival-no-waves')).toBe(false)
    expect(issues.some((i) => i.id === 'survival-no-attack-point')).toBe(false)
    expect(issues.some((i) => i.id === 'survival-no-ai-team')).toBe(false)
  })
})

describe('survival 校验', () => {
  it('坏波次与缺 attack_point 被检出', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="2" height="2" tilewidth="20" tileheight="20" nextobjectid="2">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <layer name="Ground" width="2" height="2"><data encoding="csv">1,1,1,1</data></layer>
 <layer name="Items" width="2" height="2"><data encoding="csv">0,0,0,0</data></layer>
 <objectgroup name="Triggers">
  <object id="1" name="map_info" x="0" y="0" width="20" height="20">
   <properties>
    <property name="type" value="survival"/>
    <property name="winCondition" value="none"/>
    <property name="survivalWaves" value="broken line"/>
   </properties>
  </object>
 </objectgroup>
</map>`
    const map = parseTmx(xml, resolveTsx)
    const issues = validateMap(map)
    expect(issues.some((i) => i.id.startsWith('survival-wave-error'))).toBe(true)
    expect(issues.some((i) => i.id === 'survival-no-attack-point')).toBe(true)
  })
})
