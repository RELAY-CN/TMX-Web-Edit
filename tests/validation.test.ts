import { describe, expect, it } from 'vitest'
import { parseTmx } from '@/tmx/parse'
import { resolveTsx } from '@/game/builtin'
import { validateMap } from '@/game/validation'

describe('地图校验', () => {
  it('缺少 Ground / Items / map_info 时给出错误与警告', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="2" height="2" tilewidth="20" tileheight="20" nextobjectid="1">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <layer name="Other" width="2" height="2">
  <data encoding="csv">1,1,1,1</data>
 </layer>
</map>`
    const map = parseTmx(xml, resolveTsx)
    const issues = validateMap(map)
    expect(issues.some((i) => i.id === 'missing-ground')).toBe(true)
    expect(issues.some((i) => i.id === 'missing-items')).toBe(true)
  })

  it('Ground 空格与 unitAdd 缺属性被检出', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="2" height="2" tilewidth="20" tileheight="20" nextobjectid="3">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <layer name="Ground" width="2" height="2">
  <data encoding="csv">1,0,1,1</data>
 </layer>
 <layer name="Items" width="2" height="2">
  <data encoding="csv">0,0,0,0</data>
 </layer>
 <objectgroup name="Triggers">
  <object id="1" name="map_info" x="0" y="0" width="20" height="20">
   <properties><property name="type" value="mission"/></properties>
  </object>
  <object id="2" name="bad" type="unitAdd" x="0" y="0" width="20" height="20"/>
 </objectgroup>
</map>`
    const map = parseTmx(xml, resolveTsx)
    const issues = validateMap(map)
    expect(issues.some((i) => i.id === 'ground-empty')).toBe(true)
    expect(issues.find((i) => i.id === 'ground-empty')?.tileX).toBe(1)
    expect(issues.some((i) => i.id.startsWith('unitadd-no-team'))).toBe(true)
    expect(issues.some((i) => i.id.startsWith('unitadd-no-spawn'))).toBe(true)
    expect(issues.some((i) => i.id === 'map-info-no-win')).toBe(true)
  })
})
