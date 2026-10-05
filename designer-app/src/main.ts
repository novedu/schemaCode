import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'

import App from './App.vue'
import { registerElementComponents } from './adapters/element-component-registry'

/**
 * 设计器启动：先把 Element Plus 登记进 Runtime Core ComponentMap，
 * 保证 Canvas / Preview 全部通过核心 Renderer 解析组件。
 */
registerElementComponents()

createApp(App).use(ElementPlus, { locale: zhCn }).mount('#app')
