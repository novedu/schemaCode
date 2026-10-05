<script setup lang="ts">
import { ref } from 'vue'
import { Close, Plus } from '@element-plus/icons-vue'
import { PRESET_ROLES } from './permission-model'

/**
 * RoleSelector（角色选择器 / 角色管理）
 *
 * 预置 employee / manager / finance（不可删除），
 * 作者可追加自定义角色。切换角色 = 切换当前编辑的权限列。
 */
const props = defineProps<{
  roles: string[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [string]
  add: [string]
  remove: [string]
}>()

const newRole = ref('')

function isPreset(role: string): boolean {
  return (PRESET_ROLES as readonly string[]).includes(role)
}

function onAdd(): void {
  const role = newRole.value.trim()
  if (!role) return
  emit('add', role)
  newRole.value = ''
}
</script>

<template>
  <div class="role-selector">
    <div
      v-for="role in props.roles"
      :key="role"
      class="role-chip"
      :class="{ active: role === props.modelValue }"
      @click="emit('update:modelValue', role)"
    >
      {{ role }}
      <el-icon
        v-if="!isPreset(role)"
        class="chip-close"
        @click.stop="emit('remove', role)"
      >
        <Close />
      </el-icon>
    </div>

    <div class="add-role">
      <el-input
        v-model="newRole"
        size="small"
        class="add-role-input"
        placeholder="自定义角色名"
        @keyup.enter="onAdd"
      />
      <el-button size="small" :icon="Plus" @click="onAdd">添加角色</el-button>
    </div>
  </div>
</template>

<style scoped>
.role-selector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.role-chip {
  position: relative;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  padding: 4px 14px;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
  user-select: none;
}
.role-chip.active {
  background: #722ed1;
  border-color: #722ed1;
  color: #fff;
}
.chip-close {
  margin-left: 4px;
  font-size: 11px;
  vertical-align: -1px;
}
.add-role {
  display: flex;
  gap: 6px;
  margin-left: 4px;
}
.add-role-input {
  width: 130px;
}
</style>
