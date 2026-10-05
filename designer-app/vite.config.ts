import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { configGatewayPlugin } from './src/config/dev-gateway-plugin'

/**
 * Designer App · Vite 配置
 *
 * Runtime Core（../../src）通过别名引入，设计器不复制任何核心实现。
 * vue dedupe 到本应用 node_modules，保证响应式系统只有一个实例。
 * 端口 5174：可与 demo-app（5173）同时运行，做"设计→消费"联调。
 */
export default defineConfig({
  plugins: [vue(), configGatewayPlugin()],
  resolve: {
    dedupe: ['vue'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@runtime-core': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    host: '127.0.0.1',
  },
})
