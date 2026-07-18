import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
    plugins: [vue()],
    base: './',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    esbuild: isProd
      ? {
          // 生产去掉 console / debugger（esbuild 预变换阶段）
          drop: ['console', 'debugger'],
          legalComments: 'none',
        }
      : undefined,
    build: {
      // 禁止产出 source map，降低还原源码难度
      sourcemap: false,
      // terser 进一步压缩与混淆标识符
      minify: 'terser',
      cssMinify: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1500,
      assetsInlineLimit: 4096,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
          pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
          // 尽量折叠无用代码
          dead_code: true,
          unused: true,
        },
        mangle: {
          toplevel: true,
          safari10: true,
        },
        format: {
          comments: false,
          ecma: 2020,
        },
      },
      rollupOptions: {
        output: {
          // 打散可预测的入口文件名特征
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
        },
      },
    },
  }
})
