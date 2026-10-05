<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../store/designer-store'
import { usePermissionStore } from './permission-store'
import type { PermissionStateKey } from './permission-model'

/**
 * FieldPermissionEditor（字段权限矩阵编辑器）
 *
 * 行 = Schema Designer 当前 Schema 的字段；
 * 列状态 = 当前选中角色下四个权限键（editable/readonly/disabled/visible）。
 *
 * 每个键三态：
 *   不表态（摘掉该键）/ 是 / 否
 * 初始全部"不表态"——不配置就不生成任何值，严格 Patch 语义。
 */
const { currentSchema } = useDesignerStore()
const { state, setFieldState } = usePermissionStore()

const fields = computed(() =>
  currentSchema.value.fields.map((f) => ({ name: f.name, label: f.label })),
)

const STATE_COLUMNS: { key: PermissionStateKey; label: string }[] = [
  { key: 'editable', label: '可编辑' },
  { key: 'readonly', label: '只读' },
  { key: 'disabled', label: '禁用' },
  { key: 'visible', label: '显示' },
]

type TriValue = '' | 'true' | 'false'

/** 当前 字段×选中角色 的补丁中某键的三态值 */
function triValue(field: string, key: PermissionStateKey): TriValue {
  const entry = state.doc.entries.find(
    (e) => e.field === field && e.role === state.selectedRole,
  )
  const value = entry?.patch[key]
  if (value === undefined) return ''
  return value ? 'true' : 'false'
}

/** 三态切换 → store（''=不表态=undefined，摘掉该键） */
function onChange(field: string, key: PermissionStateKey, tri: TriValue): void {
  setFieldState(field, key, tri === '' ? undefined : tri === 'true')
}
</script>

<template>
  <el-empty
    v-if="fields.length === 0"
    description="Schema 还没有字段，请先在 Schema Designer 添加组件"
  />

  <el-table v-else :data="fields" size="small" border class="perm-table">
    <el-table-column label="字段" min-width="170">
      <template #default="{ row }">
        <div class="field-cell">
          <span class="field-label">{{ row.label }}</span>
          <span class="field-name">{{ row.name }}</span>
        </div>
      </template>
    </el-table-column>

    <el-table-column
      v-for="col in STATE_COLUMNS"
      :key="col.key"
      :label="col.label"
      width="108"
      align="center"
    >
      <template #default="{ row }">
        <el-select
          :model-value="triValue(row.name, col.key)"
          size="small"
          class="tri-select"
          @update:model-value="(v: TriValue) => onChange(row.name, col.key, v)"
        >
          <el-option value="" label="不表态" />
          <el-option value="true" label="是" />
          <el-option value="false" label="否" />
        </el-select>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.field-cell {
  display: flex;
  flex-direction: column;
}
.field-label {
  font-size: 12px;
  color: #303133;
}
.field-name {
  font-size: 11px;
  color: #a8abb2;
  font-family: ui-monospace, monospace;
}
.tri-select {
  width: 92px;
}
</style>
