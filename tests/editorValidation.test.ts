import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import type { TmxMap } from '@/tmx/types'

function mapFixture(): TmxMap {
  return {
    version: '1.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: 2,
    height: 1,
    tilewidth: 20,
    tileheight: 20,
    nextobjectid: 1,
    properties: {},
    tilesets: [],
    layers: [
      {
        kind: 'tile',
        name: 'Ground',
        width: 2,
        height: 1,
        visible: true,
        opacity: 1,
        properties: {},
        data: new Uint32Array(2),
        extraAttrs: {},
      },
    ],
    extraAttrs: {},
  }
}

describe('编辑器校验修订号', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('同一笔画只在提交时触发一次全图校验', () => {
    const store = useEditorStore()
    store.mapRef = mapFixture()
    const startRev = store.rev

    expect(store.validationRev).toBe(0)
    store.setTile(0, 0, 0, 1)
    store.setTile(0, 1, 0, 1)

    expect(store.rev).toBe(startRev + 2)
    expect(store.validationRev).toBe(0)

    store.commitStroke('绘制')
    expect(store.validationRev).toBe(1)
  })
})
