export interface EditorSaveSnapshot {
  map: object | null
  fileName: string
  rev: number
  structRev: number
}

/** 异步导出完成后，仅允许仍对应当前编辑文档的结果清理 dirty 与草稿。 */
export function isEditorSaveSnapshotCurrent(
  saved: EditorSaveSnapshot,
  current: EditorSaveSnapshot,
): boolean {
  return (
    saved.map === current.map &&
    saved.fileName === current.fileName &&
    saved.rev === current.rev &&
    saved.structRev === current.structRev
  )
}
