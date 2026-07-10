import { describe, expect, it } from 'vitest'
import { isEditorSaveSnapshotCurrent, type EditorSaveSnapshot } from '@/utils/saveState'

describe('App 保存状态', () => {
  it('只有地图、文件名和修订号都未变化时才允许清理 dirty 与草稿', () => {
    const map = {}
    const snapshot: EditorSaveSnapshot = {
      map,
      fileName: 'race.tmx',
      rev: 10,
      structRev: 4,
    }

    expect(isEditorSaveSnapshotCurrent(snapshot, { ...snapshot })).toBe(true)
    expect(isEditorSaveSnapshotCurrent(snapshot, { ...snapshot, rev: 11 })).toBe(false)
    expect(isEditorSaveSnapshotCurrent(snapshot, { ...snapshot, structRev: 5 })).toBe(false)
    expect(isEditorSaveSnapshotCurrent(snapshot, { ...snapshot, fileName: 'next.tmx' })).toBe(false)
    expect(isEditorSaveSnapshotCurrent(snapshot, { ...snapshot, map: {} })).toBe(false)
  })
})
