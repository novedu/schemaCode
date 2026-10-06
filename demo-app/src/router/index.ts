import { createRouter, createWebHashHistory } from 'vue-router'
import FormRuntime from '@/pages/FormRuntime.vue'
import ApprovalCenter from '@/pages/ApprovalCenter.vue'
import SchemaManager from '@/pages/SchemaManager.vue'
import SchemaDetail from '@/pages/SchemaDetail.vue'
import SchemaVersionDetail from '@/pages/SchemaVersionDetail.vue'
import MigrationCenter from '@/pages/MigrationCenter.vue'
import DesignerPlayground from '@/pages/DesignerPlayground.vue'

/** Hash 路由：纯静态 Demo，不需要服务端 fallback 配置 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/request' },
    { path: '/request', name: 'request', component: FormRuntime, meta: { title: '我的申请' } },
    { path: '/approval', name: 'approval', component: ApprovalCenter, meta: { title: '审批中心' } },
    { path: '/schema', name: 'schema-list', component: SchemaManager, meta: { title: 'Schema 管理' } },
    { path: '/schema/:formId', name: 'schema-detail', component: SchemaDetail, meta: { title: '表单详情' } },
    { path: '/schema/:formId/versions/:version', name: 'schema-version-detail', component: SchemaVersionDetail, meta: { title: '版本详情' } },
    { path: '/migration', name: 'migration', component: MigrationCenter, meta: { title: '数据迁移' } },
    { path: '/playground', name: 'playground', component: DesignerPlayground, meta: { title: '设计器联调' } },
  ],
})
