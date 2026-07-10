import { describe, expect, it } from 'vitest'
import type { TmxTileset } from '@/tmx/types'
import { matchingLocalTileIds, preferredTilesetIndex, tilesetMatchesQuery } from '@/tmx/tilesetSearch'

const ts: TmxTileset = {
  firstgid: 100,
  name: 'Lava Decoration',
  tilewidth: 20,
  tileheight: 20,
  spacing: 0,
  margin: 0,
  tilecount: 5,
  columns: 5,
  image: 'lava_props.png',
  imagewidth: 100,
  imageheight: 20,
  properties: { embedded_png: 'abc' },
  tileProperties: {
    2: { unit: 'builder', team: '0' },
    3: { customUnit: 'mod.laser_tank' },
  },
  builtin: false,
}

describe('图块查找', () => {
  it('按地块集名称、图片名、标签和 tile 属性匹配地块集', () => {
    expect(tilesetMatchesQuery(ts, 'lava')).toBe(true)
    expect(tilesetMatchesQuery(ts, 'props')).toBe(true)
    expect(tilesetMatchesQuery(ts, '内嵌')).toBe(true)
    expect(tilesetMatchesQuery(ts, 'laser_tank')).toBe(true)
    expect(tilesetMatchesQuery(ts, 'water')).toBe(false)
  })

  it('按局部 id、gid 和属性定位 tile', () => {
    expect(matchingLocalTileIds(ts, '#2')).toEqual([2])
    expect(matchingLocalTileIds(ts, 'gid:103')).toEqual([3])
    expect(matchingLocalTileIds(ts, 'builder')).toEqual([2])
    expect(matchingLocalTileIds(ts, 'missing')).toEqual([])
  })

  it('当前地块集不匹配时切到首个匹配结果', () => {
    const other = { ...ts, firstgid: 1, name: 'Grass', image: 'grass.png', tileProperties: {} }

    expect(preferredTilesetIndex([other, ts], 'gid:103', 0)).toBe(1)
    expect(preferredTilesetIndex([other, ts], 'lava', 1)).toBe(1)
    expect(preferredTilesetIndex([other, ts], 'water', 0)).toBeNull()
  })
})
