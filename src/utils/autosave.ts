/**
 * 本地草稿自动保存（localStorage）。
 * 大地图可能超过 5MB 配额，失败时静默忽略并返回 false。
 */
const KEY = 'tmx-web-edit:draft'
const META_KEY = 'tmx-web-edit:draft-meta'

export interface DraftMeta {
  fileName: string
  savedAt: number
  width: number
  height: number
  sizeBytes: number
}

export function saveDraft(fileName: string, tmxText: string, width: number, height: number): boolean {
  try {
    const meta: DraftMeta = {
      fileName,
      savedAt: Date.now(),
      width,
      height,
      sizeBytes: tmxText.length,
    }
    localStorage.setItem(KEY, tmxText)
    localStorage.setItem(META_KEY, JSON.stringify(meta))
    return true
  } catch {
    return false
  }
}

export function loadDraft(): { meta: DraftMeta; text: string } | null {
  try {
    const text = localStorage.getItem(KEY)
    const metaRaw = localStorage.getItem(META_KEY)
    if (!text || !metaRaw) return null
    const meta = JSON.parse(metaRaw) as DraftMeta
    return { meta, text }
  } catch {
    return null
  }
}

export function clearDraft(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(META_KEY)
}

export function hasDraft(): boolean {
  return !!localStorage.getItem(KEY)
}
