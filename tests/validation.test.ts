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
<map version="1.2" orientation="orthogonal" width="2" height="1" tilewidth="20" tileheight="20" nextobjectid="10">
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
  <object id="7" name="missing team" type="unit" x="0" y="0" width="20" height="20">
   <properties><property name="unit" value="tank"/></properties>
  </object>
  <object id="9" name="missing unit" type="unit" x="20" y="0" width="20" height="20"/>
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
    expect(issues.some((i) => i.id === 'unit-object-no-unit-9')).toBe(true)
    expect(issues.find((i) => i.id === 'unit-object-no-team-7')?.message).toContain('无法加载该地图')
    expect(issues.find((i) => i.id === 'unit-object-no-unit-9')?.message).toContain('可能忽略该对象')
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

  it('Units 图块层可承载单位，不提示缺少单位对象组', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="1" height="1" tilewidth="20" tileheight="20" nextobjectid="1">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <tileset firstgid="100" source="units.tsx"/>
 <layer name="Ground" width="1" height="1"><data encoding="csv">1</data></layer>
 <layer name="Items" width="1" height="1"><data encoding="csv">0</data></layer>
 <layer name="Units" width="1" height="1"><data encoding="csv">100</data></layer>
</map>`
    const issues = validateMap(parseTmx(xml, resolveTsx))

    expect(issues.some((i) => i.id === 'missing-unitobjects')).toBe(false)
  })

  it('任意对象组中的有效单位对象都不依赖 UnitObjects 层名', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="1" height="1" tilewidth="20" tileheight="20" nextobjectid="2">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <layer name="Ground" width="1" height="1"><data encoding="csv">1</data></layer>
 <layer name="Items" width="1" height="1"><data encoding="csv">0</data></layer>
 <objectgroup name="StartingArmy">
  <object id="1" name="tank" type="unit" x="0" y="0" width="20" height="20">
   <properties>
    <property name="unit" value="tank"/>
    <property name="team" value="0"/>
   </properties>
  </object>
 </objectgroup>
</map>`
    const issues = validateMap(parseTmx(xml, resolveTsx))

    expect(issues.some((i) => i.id === 'missing-unitobjects')).toBe(false)
  })

  it('用户可见的问题文案不暴露源码实现描述', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="1" height="1" tilewidth="20" tileheight="20" nextobjectid="1">
 <tileset firstgid="1" name="custom" tilewidth="20" tileheight="20" margin="1" tilecount="1" columns="1">
  <image source="custom.png" width="22" height="22"/>
 </tileset>
 <layer name="Ground" width="1" height="1"><data encoding="csv">1</data></layer>
 <layer name="Items" width="1" height="1"><data encoding="csv">0</data></layer>
</map>`
    const issues = validateMap(parseTmx(xml, resolveTsx))

    expect(issues.map((issue) => issue.message).join('\n')).not.toContain('源码')
  })

  it('检出单位图块缺少 team 与 Units 层中的非单位图块', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="3" height="1" tilewidth="20" tileheight="20" nextobjectid="1">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <tileset firstgid="100" name="mixed" tilewidth="20" tileheight="20" tilecount="2" columns="2">
  <image source="mixed.png" width="40" height="20"/>
  <tile id="0"><properties><property name="unit" value="tank"/></properties></tile>
 </tileset>
 <layer name="Ground" width="3" height="1"><data encoding="csv">1,1,1</data></layer>
 <layer name="Items" width="3" height="1"><data encoding="csv">0,0,0</data></layer>
 <layer name="Units" width="3" height="1"><data encoding="csv">100,100,101</data></layer>
</map>`
    const issues = validateMap(parseTmx(xml, resolveTsx))

    expect(issues.some((i) => i.id === 'unit-tile-no-team-2-0-0')).toBe(true)
    expect(issues.filter((i) => i.id.startsWith('unit-tile-no-team-2-'))).toHaveLength(1)
    expect(issues.some((i) => i.id === 'units-layer-non-unit-2-2-0')).toBe(true)
    expect(issues.filter((i) => i.id.startsWith('units-layer-non-unit-2-'))).toHaveLength(1)
  })

  it('检出 Ground 中会被转换成单位的图块', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="1" height="1" tilewidth="20" tileheight="20" nextobjectid="1">
 <tileset firstgid="1" name="unit" tilewidth="20" tileheight="20" tilecount="1" columns="1">
  <image source="unit.png" width="20" height="20"/>
  <tile id="0">
   <properties>
    <property name="unit" value="tank"/>
    <property name="team" value="0"/>
   </properties>
  </tile>
 </tileset>
 <layer name="Ground" width="1" height="1"><data encoding="csv">1</data></layer>
 <layer name="Items" width="1" height="1"><data encoding="csv">0</data></layer>
</map>`
    const issues = validateMap(parseTmx(xml, resolveTsx))

    expect(issues.some((i) => i.id === 'ground-unit-tile-0-0-0')).toBe(true)
  })

  it('检出单位图块和单位对象中的非法 team，并允许 none', () => {
    const xml = `<?xml version="1.0"?>
<map version="1.2" orientation="orthogonal" width="2" height="1" tilewidth="20" tileheight="20" nextobjectid="3">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <tileset firstgid="100" name="units" tilewidth="20" tileheight="20" tilecount="2" columns="2">
  <image source="units.png" width="40" height="20"/>
  <tile id="0">
   <properties><property name="unit" value="tank"/><property name="team" value="abc"/></properties>
  </tile>
  <tile id="1">
   <properties><property name="unit" value="tree"/><property name="team" value="none"/></properties>
  </tile>
 </tileset>
 <layer name="Ground" width="2" height="1"><data encoding="csv">1,1</data></layer>
 <layer name="Items" width="2" height="1"><data encoding="csv">0,0</data></layer>
 <layer name="Units" width="2" height="1"><data encoding="csv">100,101</data></layer>
 <objectgroup name="StartingArmy">
  <object id="1" name="bad team" type="unit" x="0" y="0" width="20" height="20">
   <properties><property name="unit" value="tank"/><property name="team" value="abc"/></properties>
  </object>
  <object id="2" name="neutral" type="unit" x="20" y="0" width="20" height="20">
   <properties><property name="unit" value="tree"/><property name="team" value="none"/></properties>
  </object>
 </objectgroup>
</map>`
    const issues = validateMap(parseTmx(xml, resolveTsx))

    expect(issues.some((i) => i.id === 'unit-tile-invalid-team-2-0-0')).toBe(true)
    expect(issues.some((i) => i.id === 'unit-tile-invalid-team-2-1-0')).toBe(false)
    expect(issues.some((i) => i.id === 'unit-object-invalid-team-1')).toBe(true)
    expect(issues.some((i) => i.id === 'unit-object-invalid-team-2')).toBe(false)
  })
})
