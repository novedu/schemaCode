import { createRouter, createWebHashHistory } from 'vue-router'
import FormRuntime from '@/pages/FormRuntime.vue'
import ApprovalCenter from '@/pages/ApprovalCenter.vue'
import SchemaManager from '@/pages/SchemaManager.vue'
import MigrationCenter from '@/pages/MigrationCenter.vue'
import DesignerPlayground from '@/pages/DesignerPlayground.vue'

/** Hash 路由：纯静态 Demo，不需要服务端 fallback 配置 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/request' },
    { path: '/request', name: 'request', component: FormRuntime, meta: { title: '我的申请' } },
    { path: '/approval', name: 'approval', component: ApprovalCenter, meta: { title: '审批中心' } },
    { path: '/schema', name: 'schema', component: SchemaManager, meta: { title: 'Schema 管理' } },
    { path: '/migration', name: 'migration', component: MigrationCenter, meta: { title: '数据迁移' } },
    { path: '/playground', name: 'playground', component: DesignerPlayground, meta: { title: '设计器联调' } },
  ],
})
