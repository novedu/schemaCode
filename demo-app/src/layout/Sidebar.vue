<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Cpu, Document, Files, Promotion, SetUp } from '@element-plus/icons-vue'

const route = useRoute()

const menus = [
  { path: '/request', label: '我的申请', icon: Document },
  { path: '/approval', label: '审批中心', icon: Promotion },
  { path: '/schema', label: 'Schema 管理', icon: Files },
  { path: '/migration', label: '数据迁移', icon: SetUp },
  { path: '/playground', label: '设计器联调', icon: Cpu },
]
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">OA</div>
      <div class="brand-text">
        <div class="brand-title">企业OA系统</div>
        <div class="brand-sub">Low-Code Runtime</div>
      </div>
    </div>

    <el-menu :default-active="route.path" class="nav-menu" router>
      <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
        <el-icon><component :is="m.icon" /></el-icon>
        <span>{{ m.label }}</span>
      </el-menu-item>
    </el-menu>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 232px;
  background: #001529;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
}
.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: linear-gradient(135deg, #409eff, #36cfc9);
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 1px;
}
.brand-title {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
.brand-sub {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  margin-top: 2px;
}
.nav-menu {
  border-right: none;
  background: transparent;
  flex: 1;
}
.nav-menu :deep(.el-menu-item) {
  color: rgba(255, 255, 255, 0.7);
}
.nav-menu :deep(.el-menu-item.is-active) {
  background: rgba(64, 158, 255, 0.16);
  color: #fff;
}
.nav-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
</style>
