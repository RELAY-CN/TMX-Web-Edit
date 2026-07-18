/**
 * 生产环境轻量防逆向（前端只能提高门槛，无法绝对防住）。
 * - 屏蔽常见快捷键 / 右键菜单
 * - 定时检测 DevTools 尺寸差并打断调试
 * - 清空 console 输出
 *
 * 仅应在 import.meta.env.PROD 下调用。
 */

const DEVTOOLS_THRESHOLD = 160

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
      return false
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
      // F12
      if (key === 'F12' || code === 'F12') {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      // Ctrl+Shift+I/J/C/U / Ctrl+U
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(key.toUpperCase())) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.ctrlKey && !e.shiftKey && key.toUpperCase() === 'U') {
        e.preventDefault()
        e.stopPropagation()
      }
      // macOS meta+alt+i
      if (e.metaKey && e.altKey && key.toUpperCase() === 'I') {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    true,
  )
}

/** 尺寸差启发式检测 + debugger 打断（打开控制台时明显卡顿） */
function startDevtoolsTrap() {
  let armed = true
  const hitDebugger = () => {
    try {
      // eslint-disable-next-line no-debugger
      debugger
    } catch {
      /* ignore */
    }
  }

  const tick = () => {
    if (!armed) return
    const widthGap = Math.abs(window.outerWidth - window.innerWidth)
    const heightGap = Math.abs(window.outerHeight - window.innerHeight)
    if (widthGap > DEVTOOLS_THRESHOLD || heightGap > DEVTOOLS_THRESHOLD) {
      hitDebugger()
    }
    // Function 构造检测（控制台/断点环境部分场景会变慢或异常）
    try {
      const t0 = performance.now()
      // eslint-disable-next-line no-new-func
      new Function('debugger')()
      if (performance.now() - t0 > 100) hitDebugger()
    } catch {
      /* ignore */
    }
  }

  // 使用不规则间隔，降低被一次性 hook 掉的概率
  const loop = () => {
    tick()
    const delay = 800 + Math.floor(Math.random() * 900)
    window.setTimeout(loop, delay)
  }
  loop()

  document.addEventListener('visibilitychange', () => {
    armed = !document.hidden
  })
}

function disableSelectionShortcutNoise() {
  // 禁止拖选源码区域无意义；编辑器内 input/textarea 仍需可选
  document.addEventListener(
    'selectstart',
    (e) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
      // 允许画布/面板文字选择影响小，不强制禁止
    },
    true,
  )
}

export function enableAntiReverse() {
  if (typeof window === 'undefined') return
  stripConsole()
  blockContextMenu()
  blockDevtoolsShortcuts()
  disableSelectionShortcutNoise()
  startDevtoolsTrap()
}
