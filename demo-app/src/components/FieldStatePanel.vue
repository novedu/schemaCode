<script setup lang="ts">
import { computed } from 'vue'
import type { FieldState, Schema } from '@runtime-core/types'
import type { FieldDecisionTrace } from '@runtime-core/state-resolution/field-state-resolver'

/**
 * FieldState Inspector
 *
 * 展示每个字段最终 FieldState 的六个键，并标注【来源】：
 *   visible/required/... → 由哪个 Provider 决定（核心 trace.decidedBy）
 *   warnings             → Rule Provider（warnings 只在规则层产出）
 *
 * 这回答了核心问题："这个状态是谁决定的？"
 */
const props = defineProps<{
  schema: Schema
  states: Record<string, FieldState>
  traces: FieldDecisionTrace[]
}>()

const SOURCE_LABEL: Record<string, string> = {
  schema: 'Schema Provider',
  rule: 'Rule Provider',
  bpm: 'BPM Provider',
  permission: 'Permission Provider',
}

const BOOL_KEYS = ['visible', 'required', 'readonly', 'disabled', 'editable'] as const

const rows = computed(() =>
  props.schema.fields.map((f) => {
    const trace = props.traces.find((t) => t.field === f.name)
    return {
      field: f.name,
      label: f.label,
      state: props.states[f.name],
      trace,
    }
  }),
)

function sourceOf(trace: FieldDecisionTrace | undefined, key: string): string {
  const by = trace?.decidedBy?.[key as keyof FieldState]
  return by ? (SOURCE_LABEL[by] ?? by) : '—'
}
</script>

<template>
  <div class="state-panel">
    <div v-for="row in rows" :key="row.field" class="state-block">
      <div class="state-field">
        <span class="field-label">{{ row.label }}</span>
        <span class="field-name">{{ row.field }}</span>
      </div>

      <el-descriptions :column="1" size="small" border>
        <el-descriptions-item
          v-for="key in BOOL_KEYS"
          :key="key"
          :label="key"
        >
          <el-tag :type="row.state?.[key] ? 'success' : 'info'" size="small">
            {{ String(row.state?.[key] ?? false) }}
          </el-tag>
          <span class="source-tag">{{ sourceOf(row.trace, key) }}</span>
        </el-descriptions-item>

        <el-descriptions-item label="warnings">
          <template v-if="row.state?.warnings?.length">
            <el-tag
              v-for="(w, i) in row.state.warnings"
              :key="i"
              type="warning"
              size="small"
              class="warn-tag"
            >
              {{ w }}
            </el-tag>
          </template>
          <span v-else class="empty">—</span>
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>

<style scoped>
.state-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.state-field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.field-label {
  font-weight: 600;
  color: #303133;
}
.field-name {
  font-size: 11px;
  color: #a8abb2;
  font-family: ui-monospace, monospace;
}
.source-tag {
  margin-left: 8px;
  font-size: 11px;
  color: #909399;
}
.warn-tag {
  margin: 2px 6px 2px 0;
}
.empty {
  color: #c0c4cc;
}
</style>
