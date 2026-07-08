/**
 * TMX 解析/序列化往返测试。
 * 使用工作区内的真实游戏地图（若存在）+ 手工构造的小地图验证：
 *  - base64+gzip/zlib 图层数据解码/编码一致
 *  - 对象、属性、地块集（内置引用 / embedded_png 内嵌）完整往返
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseTmx } from '@/tmx/parse'
import { serializeTmx } from '@/tmx/serialize'
import { resolveTsx } from '@/game/builtin'
import { isObjectGroup, isTileLayer } from '@/tmx/types'

const SAMPLE_DIR = path.resolve(__dirname, '..', '..', '..')

function findSampleTmx(): string | null {
  try {
    const files = fs.readdirSync(SAMPLE_DIR).filter((f) => f.endsWith('.tmx'))
    return files.length ? path.join(SAMPLE_DIR, files[0]) : null
  } catch {
    return null
  }
}

describe('TMX 往返', () => {
  it('小地图: 构造→序列化→解析 保持一致', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.2" orientation="orthogonal" renderorder="right-down" width="4" height="3" tilewidth="20" tileheight="20" nextobjectid="3">
 <tileset firstgid="1" source="terrain/Dirt.tsx"/>
 <tileset firstgid="101" name="custom" tilewidth="20" tileheight="20" tilecount="4" columns="2">
  <properties>
   <property name="embedded_png">iVBORw0KGgoAAAANSUhEUg==</property>
  </properties>
  <image source="custom.png" width="40" height="40"/>
  <tile id="1"><properties><property name="water" value=""/></properties></tile>
 </tileset>
 <layer name="Ground" width="4" height="3">
  <data encoding="csv">1,1,1,1,1,101,102,1,1,1,1,1</data>
 </layer>
 <layer name="Items" width="4" height="3">
  <data encoding="csv">0,0,0,0,0,0,0,0,0,0,0,0</data>
 </layer>
 <objectgroup name="Triggers">
  <object id="1" name="map_info" x="20" y="20" width="60" height="40">
   <properties>
    <property name="type" value="mission"/>
    <property name="winCondition" value="allBuildings"/>
    <property name="introText">第一行
第二行</property>
   </properties>
  </object>
  <object id="2" name="spawn1" type="unitAdd" x="100" y="80" width="40" height="40">
   <properties>
    <property name="team" value="0"/>
    <property name="spawnUnits" value="tank*3"/>
    <property name="delay" value="5s"/>
   </properties>
  </object>
 </objectgroup>
</map>`

    const map1 = parseTmx(xml, resolveTsx)
    expect(map1.width).toBe(4)
    expect(map1.tilesets).toHaveLength(2)
    expect(map1.tilesets[0].builtin).toBe(true)
    expect(map1.tilesets[0].source).toBe('terrain/Dirt.tsx')
    expect(map1.tilesets[1].properties['embedded_png']).toContain('iVBOR')

    const ground = map1.layers[0]
    if (!isTileLayer(ground)) throw new Error('第一层应为图块层')
    expect(Array.from(ground.data.slice(4, 8))).toEqual([1, 101, 102, 1])

    const out = serializeTmx(map1)
    // 内置地块集必须保持 source 引用，不内嵌
    expect(out).toContain('<tileset firstgid="1" source="terrain/Dirt.tsx"/>')
    // 自定义地块集必须保留 embedded_png
    expect(out).toContain('embedded_png')
    // 图层输出为 base64+zlib
    expect(out).toContain('encoding="base64" compression="zlib"')

    const map2 = parseTmx(out, resolveTsx)
    const ground2 = map2.layers[0]
    if (!isTileLayer(ground2)) throw new Error('往返后第一层应为图块层')
    expect(Array.from(ground2.data)).toEqual(Array.from(ground.data))

    const trig = map2.layers[2]
    if (!isObjectGroup(trig)) throw new Error('第三层应为对象组')
    expect(trig.name).toBe('Triggers')
    const mapInfo = trig.objects.find((o) => o.name === 'map_info')!
    expect(mapInfo.properties['type']).toBe('mission')
    expect(mapInfo.properties['introText']).toBe('第一行\n第二行')
    const spawn = trig.objects.find((o) => o.name === 'spawn1')!
    expect(spawn.type).toBe('unitAdd')
    expect(spawn.properties['spawnUnits']).toBe('tank*3')
    expect(spawn.properties['delay']).toBe('5s')
  })

  it('真实游戏地图: 解析→序列化→再解析 图层与对象一致', () => {
    const sample = findSampleTmx()
    if (!sample) {
      console.warn('未找到示例 tmx，跳过')
      return
    }
    const xml = fs.readFileSync(sample, 'utf8')
    const map1 = parseTmx(xml, resolveTsx)
    expect(map1.width).toBeGreaterThan(0)
    expect(map1.layers.length).toBeGreaterThan(0)

    const out = serializeTmx(map1)
    const map2 = parseTmx(out, resolveTsx)

    expect(map2.width).toBe(map1.width)
    expect(map2.height).toBe(map1.height)
    expect(map2.tilesets.length).toBe(map1.tilesets.length)
    expect(map2.layers.length).toBe(map1.layers.length)

    for (let i = 0; i < map1.layers.length; i++) {
      const a = map1.layers[i]
      const b = map2.layers[i]
      expect(b.kind).toBe(a.kind)
      expect(b.name).toBe(a.name)
      if (isTileLayer(a) && isTileLayer(b)) {
        expect(b.data.length).toBe(a.data.length)
        // 全量对比
        let diff = 0
        for (let j = 0; j < a.data.length; j++) {
          if (a.data[j] !== b.data[j]) diff++
        }
        expect(diff).toBe(0)
      }
      if (isObjectGroup(a) && isObjectGroup(b)) {
        expect(b.objects.length).toBe(a.objects.length)
        for (let j = 0; j < a.objects.length; j++) {
          expect(b.objects[j].name).toBe(a.objects[j].name)
          expect(b.objects[j].type).toBe(a.objects[j].type)
          expect(b.objects[j].properties).toEqual(a.objects[j].properties)
        }
      }
    }
    // 地块集 embedded_png 保留
    for (let i = 0; i < map1.tilesets.length; i++) {
      const a = map1.tilesets[i]
      const b = map2.tilesets[i]
      expect(b.firstgid).toBe(a.firstgid)
      if (a.properties['embedded_png'] && !a.builtin) {
        expect(b.properties['embedded_png']?.replace(/\s+/g, '')).toBe(
          a.properties['embedded_png'].replace(/\s+/g, ''),
        )
      }
    }
  }, 120000)
})
