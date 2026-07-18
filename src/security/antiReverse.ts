/**
 * 生产环境轻量防逆向（提高门槛，不能绝对防住）。
 *
 * 设计原则：
 *  - 不阻塞首屏加载
 *  - 不主动每秒执行 debugger（避免正常用户/嵌入 WebView 卡死）
 *  - 仅屏蔽常见“顺手”逆向路径：右键、F12、Ctrl+U 等
 *  - console 静默，降低信息泄露
 *
 * 仅应在 import.meta.env.PROD 下调用。
 */

function stripConsole() {
  const noop = () => {}
  const methods = [
    'log',
    'debug',
    'info',
    'warn',
    'error',
    'table',
    'trace',
    'dir',
    'dirxml',
    'group',
    'groupCollapsed',
    'groupEnd',
    'time',
    'timeEnd',
    'timeLog',
    'assert',
    'count',
    'countReset',
    'profile',
    'profileEnd',
  ] as const
  const c = console as unknown as Record<string, unknown>
  for (const m of methods) {
    try {
      c[m] = noop
    } catch {
      /* ignore */
    }
  }
}

function blockContextMenu() {
  window.addEventListener(
    'contextmenu',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
    },
    true,
  )
}

function blockDevtoolsShortcuts() {
  window.addEventListener(
    'keydown',
    (e) => {
      const key = e.key
      const code = e.code
      if (key === 'F12' || code === 'F12') {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(key.toUpperCase())) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.ctrlKey && !e.shiftKey && key.toUpperCase() === 'U') {
        e.preventDefault()
        e.stopPropagation()
      }
      if (e.metaKey && e.altKey && key.toUpperCase() === 'I') {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    true,
  )
}

/**
 * 可选：仅当 URL 带 ?hardProtect=1 时启用 DevTools 尺寸启发式 debugger。
 * 默认关闭，避免误伤普通用户与自动化测试。
 */
function maybeStartDevtoolsTrap() {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('hardProtect') !== '1') return
  } catch {
    return
  }

  const THRESHOLD = 160
  const loop = () => {
    const widthGap = Math.abs(window.outerWidth - window.innerWidth)
    const heightGap = Math.abs(window.outerHeight - window.innerHeight)
    if (widthGap > THRESHOLD || heightGap > THRESHOLD) {
      try {
        // eslint-disable-next-line no-debugger
        debugger
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(loop, 1200 + Math.floor(Math.random() * 800))
  }
  loop()
}

export function enableAntiReverse() {
  if (typeof window === 'undefined') return
  stripConsole()
  blockContextMenu()
  blockDevtoolsShortcuts()
  maybeStartDevtoolsTrap()
}
