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

  it('检出无效 gid、tileset margin 兼容风险、单位对象缺属性和可优化自定义图块', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="2" height="1" tilewidth="20" tileheight="20" nextobjectid="9">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <tileset firstgid="100" name="custom" tilewidth="20" tileheight="20" margin="1" tilecount="4" columns="2">
  <properties><property name="embedded_png">iVBORw0KGgoAAAANSUhEUg==</property></properties>
  <image source="custom.png" width="42" height="42"/>
 </tileset>
 <layer name="Ground" width="2" height="1">
  <data encoding="csv">100,105</data>
 </layer>
 <layer name="Items" width="2" height="1">
  <data encoding="csv">0,0</data>
 </layer>
 <objectgroup name="Triggers">
  <object id="1" name="map_info" x="0" y="0" width="20" height="20">
   <properties><property name="type" value="skirmish"/></properties>
  </object>
 </objectgroup>
 <objectgroup name="UnitObjects">
  <object id="7" name="bad unit" type="unit" x="0" y="0" width="20" height="20"/>
 </objectgroup>
 <objectgroup name="Decorations">
  <object id="8" name="bad tile object" gid="106" x="0" y="0" width="20" height="20"/>
 </objectgroup>
</map>`
    const map = parseTmx(xml, resolveTsx)
    const issues = validateMap(map)

    expect(issues.some((i) => i.id === 'invalid-tile-gid-1-0')).toBe(true)
    expect(issues.some((i) => i.id === 'tileset-margin-1')).toBe(true)
    expect(issues.some((i) => i.id === 'unit-object-no-team-7')).toBe(true)
    expect(issues.some((i) => i.id === 'unit-object-no-unit-7')).toBe(true)
    expect(issues.some((i) => i.id === 'invalid-object-gid-8')).toBe(true)
    expect(issues.some((i) => i.id === 'custom-tileset-unused-1')).toBe(true)
  })

  it('检出未按 firstgid 严格递增排列的地块集', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="1" height="1" tilewidth="20" tileheight="20" nextobjectid="1">
 <tileset firstgid="100" source="terrain/Dirt.tsx"/>
 <tileset firstgid="1" source="terrain/Long Grass.tsx"/>
 <layer name="Ground" width="1" height="1"><data encoding="csv">1</data></layer>
 <layer name="Items" width="1" height="1"><data encoding="csv">0</data></layer>
</map>`
    const issues = validateMap(parseTmx(xml, resolveTsx))

    expect(issues.some((i) => i.id === 'tileset-firstgid-order-1')).toBe(true)
  })
})
