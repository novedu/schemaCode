import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * Demo App · Vite 配置
 *
 * 关键：Runtime Core（../src）通过别名引入，demo-app 不复制任何核心实现。
 * vue 强制去重到 demo-app 自己的 node_modules，避免核心与应用各装一份 Vue
 * 导致响应式系统分叉（两个 Vue 实例的响应式互不认识）。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@runtime-core': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // Config Gateway：demo 把网关请求转发到 designer-app（5174）进程，
      // 两应用共享同一份内存配置仓储（单例位于 5174）。
      '/__config': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
      },
    },
  },
})
