<script setup lang="ts">
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { useRuleStore } from '../rule-store'
import { useDesignerStore } from '../../store/designer-store'
import type { FieldAction, RuleDoc } from '../rule-model'

/**
 * FieldActionEditor（字段动作编辑器 · Action Builder）
 *
 * 配置规则命中时"对哪个字段、做什么状态变更"：
 *
 *   then: {
 *     companyName: { visible: true, required: true }
 *   }
 *
 * 每个状态键是三态：是 / 否 / 不表态（本规则在该键上沉默，
 * 交给基线与其他规则裁决）。这忠实于核心 patch merge 语义——
 * 补丁里没有的键不会覆盖任何东西。
 */
const props = defineProps<{
  doc: RuleDoc
}>()

const {
  setAction,
  deleteAction,
  replaceAction,
  renameActionField,
} = useRuleStore()
const { currentSchema } = useDesignerStore()

/** Schema 全部字段（动作只能指向页面上存在的字段） */
const allFields = computed(() =>
  currentSchema.value.fields.map((f) => ({
    value: f.name,
    label: `${f.label} (${f.name})`,
  })),
)

const rows = computed(() =>
  Object.entries(props.doc.then).map(([field, patch]) => ({ field, patch })),
)

const STATE_KEYS: { key: keyof FieldAction; label: string }[] = [
  { key: 'visible', label: '显示' },
  { key: 'required', label: '必填' },
  { key: 'disabled', label: '禁用' },
  { key: 'readonly', label: '只读' },
]

/** 三态选择：''=不表态（摘掉该键），true/false 显式表态 */
type TriValue = '' | 'true' | 'false'

function triValue(patch: FieldAction, key: keyof FieldAction): TriValue {
  const value = patch[key]
  if (value === undefined) return ''
  return value ? 'true' : 'false'
}

function changeTri(field: string, key: keyof FieldAction, tri: TriValue): void {
  const current = props.doc.then[field] ?? {}
  const next: FieldAction = { ...current }

  if (tri === '') delete next[key]
  else next[key] = tri === 'true'
  replaceAction(props.doc.id, field, next)
}

function changeField(oldField: string, newField: string): void {
  if (!newField || newField === oldField) return
  renameActionField(props.doc.id, oldField, newField)
}

function addRow(): void {
  const used = new Set(Object.keys(props.doc.then))
  const candidate = allFields.value.find((f) => !used.has(f.value))
  if (!candidate) return
  // 新动作默认"显示=是"，符合最高频的显隐规则场景
  setAction(props.doc.id, candidate.value, { visible: true })
}
</script>

<template>
  <div class="action-editor">
    <el-empty
      v-if="rows.length === 0"
      description="暂无动作，点击下方按钮添加目标字段"
      :image-size="60"
    />

    <div v-for="row in rows" :key="row.field" class="action-row">
      <div class="row-head">
        <el-select
          :model-value="row.field"
          size="small"
          class="target-select"
          filterable
          @update:model-value="(v: string) => changeField(row.field, v)"
        >
          <el-option
            v-for="f in allFields"
            :key="f.value"
            :label="f.label"
            :value="f.value"
          />
        </el-select>

        <el-button
          type="danger"
          text
          size="small"
          :icon="Delete"
          @click="deleteAction(doc.id, row.field)"
        />
      </div>

      <div class="tri-grid">
        <div v-for="stateKey in STATE_KEYS" :key="stateKey.key" class="tri-item">
          <span class="tri-label">{{ stateKey.label }}</span>
          <el-select
            :model-value="triValue(row.patch, stateKey.key)"
            size="small"
            class="tri-select"
            @update:model-value="(v: TriValue) => changeTri(row.field, stateKey.key, v)"
          >
            <el-option value="" label="不表态" />
            <el-option value="true" label="是" />
            <el-option value="false" label="否" />
          </el-select>
        </div>
      </div>
    </div>

    <el-button
      size="small"
      :icon="Plus"
      :disabled="allFields.length === 0"
      @click="addRow"
    >
      添加目标字段
    </el-button>
  </div>
</template>

<style scoped>
.action-row {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}
.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.target-select {
  flex: 1;
}
.tri-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}
.tri-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tri-label {
  font-size: 12px;
  color: #606266;
}
.tri-select {
  width: 88px;
}
</style>
