<script setup lang="ts">
import { computed } from 'vue'
import { Monitor } from '@element-plus/icons-vue'
import { useRuntimeStore } from '@/stores/runtime-store'

const { state, toggleDebug } = useRuntimeStore()

const user = computed(() => state.context.user)
const roles = computed(() => user.value.roles.join(' / '))
</script>

<template>
  <header class="header">
    <div class="header-left">
      <span class="page-hint">企业低代码运行时 · Runtime Core 驱动</span>
    </div>

    <div class="header-right">
      <el-tag size="small" type="info" effect="plain">节点：{{ state.nodeLabel }}</el-tag>
      <el-divider direction="vertical" />
      <el-avatar :size="30" class="avatar">{{ user.name?.charAt(0) ?? 'U' }}</el-avatar>
      <div class="user-meta">
        <div class="user-name">用户：{{ user.name ?? '未知' }}</div>
        <div class="user-role">角色：{{ roles }}</div>
      </div>
      <el-divider direction="vertical" />
      <el-button size="small" :icon="Monitor" @click="toggleDebug(true)">Runtime Debug</el-button>
    </div>
  </header>
</template>

<style scoped>
.header {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}
.page-hint {
  color: #909399;
  font-size: 13px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.avatar {
  background: #409eff;
  color: #fff;
  font-size: 13px;
}
.user-meta {
  line-height: 1.25;
}
.user-name {
  font-size: 13px;
  color: #303133;
}
.user-role {
  font-size: 11px;
  color: #909399;
}
</style>
