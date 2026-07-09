import { describe, expect, it } from 'vitest'
import type { TmxMap, TmxTileset } from '@/tmx/types'
import { FLIP_H } from '@/tmx/types'
import {
  optimizeEmbeddedTilesetsForSerialization,
  type CompactTilesetImageEncoder,
} from '@/tmx/optimize'

function tileset(patch: Partial<TmxTileset>): TmxTileset {
  return {
    firstgid: 1,
    name: 'tiles',
    tilewidth: 20,
    tileheight: 20,
    spacing: 0,
    margin: 0,
    tilecount: 1,
    columns: 1,
    image: 'tiles.png',
    imagewidth: 20,
    imageheight: 20,
    properties: {},
    tileProperties: {},
    ...patch,
  }
}

function makeMap(): TmxMap {
  const custom = tileset({
    firstgid: 100,
    name: 'custom',
    tilecount: 6,
    columns: 3,
    imagewidth: 60,
    imageheight: 40,
    properties: { embedded_png: 'full-custom-png' },
    tileProperties: {
      1: { decoration: 'unused' },
      3: { water: '' },
      5: { unit: 'tank' },
    },
    bitmap: { width: 60, height: 40 } as ImageBitmap,
    builtin: false,
  })
  const unused = tileset({
    firstgid: 200,
    name: 'unused',
    tilecount: 4,
    columns: 2,
    imagewidth: 40,
    imageheight: 40,
    properties: { embedded_png: 'unused-png' },
    bitmap: { width: 40, height: 40 } as ImageBitmap,
    builtin: false,
  })
  return {
    version: '1.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: 4,
    height: 1,
    tilewidth: 20,
    tileheight: 20,
    nextobjectid: 2,
    properties: {},
    tilesets: [
      tileset({ firstgid: 1, name: 'builtin', source: 'terrain/Dirt.tsx', builtin: true, tilecount: 8 }),
      custom,
      unused,
    ],
    layers: [
      {
        kind: 'tile',
        name: 'Ground',
        width: 4,
        height: 1,
        visible: true,
        opacity: 1,
        properties: {},
        data: new Uint32Array([1, 100, FLIP_H | 105, 0]),
        extraAttrs: {},
      },
      {
        kind: 'objectgroup',
        name: 'UnitObjects',
        visible: true,
        opacity: 1,
        properties: {},
        objects: [
          {
            id: 1,
            name: 'tile object',
            type: 'unit',
            x: 0,
            y: 0,
            width: 20,
            height: 20,
            rotation: 0,
            gid: 103,
            visible: true,
            properties: { unit: 'tank', team: '0' },
            extraAttrs: {},
          },
        ],
        extraAttrs: {},
      },
    ],
    extraAttrs: {},
  }
}

describe('embedded tileset 优化', () => {
  it('导出副本只保留实际使用的自定义 tile 并重映射图层与对象 gid', async () => {
    const map = makeMap()
    const encoded: string[] = []
    const encoder: CompactTilesetImageEncoder = async (ts, usedLocalIds, geometry) => {
      encoded.push(`${ts.name}:${usedLocalIds.join(',')}:${geometry.columns}x${geometry.rows}`)
      return {
        embeddedPng: `compact:${usedLocalIds.join(',')}`,
        imagewidth: geometry.columns * ts.tilewidth,
        imageheight: geometry.rows * ts.tileheight,
      }
    }

    const result = await optimizeEmbeddedTilesetsForSerialization(map, encoder)
    const out = result.map

    expect(encoded).toEqual(['custom:0,3,5:2x2'])
    expect(result.stats.compactedTilesets).toBe(1)
    expect(result.stats.removedTilesets).toBe(1)
    expect(result.stats.remappedGids).toBe(3)

    expect(out.tilesets.map((ts) => ts.name)).toEqual(['builtin', 'custom'])
    const custom = out.tilesets[1]
    expect(custom.tilecount).toBe(3)
    expect(custom.columns).toBe(2)
    expect(custom.spacing).toBe(0)
    expect(custom.margin).toBe(0)
    expect(custom.imagewidth).toBe(40)
    expect(custom.imageheight).toBe(40)
    expect(custom.properties.embedded_png).toBe('compact:0,3,5')
    expect(custom.tileProperties).toEqual({
      1: { water: '' },
      2: { unit: 'tank' },
    })

    const ground = out.layers[0]
    if (ground.kind !== 'tile') throw new Error('Ground should be tile layer')
    expect(Array.from(ground.data)).toEqual([1, 100, (FLIP_H | 102) >>> 0, 0])
    const group = out.layers[1]
    if (group.kind !== 'objectgroup') throw new Error('UnitObjects should be objectgroup')
    expect(group.objects[0].gid).toBe(101)

    const originalGround = map.layers[0]
    if (originalGround.kind !== 'tile') throw new Error('Ground should be tile layer')
    expect(Array.from(originalGround.data)).toEqual([1, 100, (FLIP_H | 105) >>> 0, 0])
    expect(map.tilesets).toHaveLength(3)
    expect(map.tilesets[1].tilecount).toBe(6)
  })
})
