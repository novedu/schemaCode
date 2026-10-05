import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'

import App from './App.vue'
import { router } from './router'
import { registerElementComponents } from './adapters/element-component-registry'

/**
 * 应用启动：
 *   1. 先把 Element Plus 组件登记进 Runtime Core 的 ComponentMap；
 *   2. 全量引入 Element Plus；
 *   3. 挂载路由。
 */
registerElementComponents()

createApp(App).use(router).use(ElementPlus, { locale: zhCn }).mount('#app')
