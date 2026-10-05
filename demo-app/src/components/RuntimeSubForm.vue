<script setup lang="ts">
/**
 * RuntimeSubForm（子表宿主渲染组件）
 *
 * 职责：
 *   - 把 SubFormSchema 渲染为 el-table 表格
 *   - 管理行数据（SubFormRow[]）的添加 / 删除 / 编辑
 *   - 执行行内计算（expression）与表格级聚合（SUM）
 *   - 把聚合结果写回顶层 formValues
 *
 * 边界：
 *   - 不依赖 Runtime Core 的 Resolver / Rule Scheduler
 *   - 复用 src/subform/subform-core.ts 的纯函数
 *   - 行数据变化时通过 emit('update:rows') 通知父组件
 */
import { computed } from 'vue'
import type { SubFormSchema, SubFormRow } from '../../../src/types'
import {
  createRow,
  removeRow,
  setRowValue,
  computeRow,
  computeAggregates,
  extractComputedFields,
} from '../../../src/subform/subform-core'

const props = defineProps<{
  schema: SubFormSchema
  /** 当前行数据（由父组件维护） */
  rows: SubFormRow[]
  /** 全局 formValues（聚合结果写回这里） */
  formValues: Record<string, unknown>
  /** 是否只读（BPM / 权限控制） */
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:rows': [rows: SubFormRow[]]
  'update:formValues': [patch: Record<string, unknown>]
}>()

/** 提取计算字段定义 */
const computedDefs = computed(() => extractComputedFields(props.schema))

/** 判断某列是否为计算字段（计算字段只读） */
function isComputedColumn(field: string): boolean {
  return computedDefs.value.some((cf) => cf.targetField === field)
}

/* ── 行操作 ── */

/**
 * 生成下一个 rowId：基于现有行的最大序号 + 1。
 * 不依赖组件实例内可变状态（组件可能因父级重渲染而重置内部变量）。
 */
function nextRowId(): string {
  let max = 0
  for (const r of props.rows) {
    const m = /^row-(\d+)/.exec(r.rowId)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `row-${max + 1}-${Date.now().toString(36)}`
}

function addRow(): void {
  const newRow = createRow(nextRowId(), props.schema.columns)
  const next = [...props.rows, newRow]
  emit('update:rows', next)
  recomputeAggregates(next)
}

function deleteRow(rowId: string): void {
  const next = removeRow(props.rows, rowId)
  emit('update:rows', next)
  recomputeAggregates(next)
}

/* ── 行内编辑 ── */

function onCellChange(rowId: string, field: string, value: unknown): void {
  const row = props.rows.find((r) => r.rowId === rowId)
  if (!row) return

  // 1. 更新字段值
  let updated = setRowValue(row, field, value)

  // 2. 执行行内计算
  if (computedDefs.value.length > 0) {
    updated = computeRow(updated, computedDefs.value)
  }

  // 3. 替换行
  const next = props.rows.map((r) => (r.rowId === rowId ? updated : r))
  emit('update:rows', next)

  // 4. 重新计算聚合
  recomputeAggregates(next)
}

/* ── 聚合 ── */

function recomputeAggregates(rows: SubFormRow[]): void {
  const aggregates = props.schema.aggregates

  if (!aggregates?.length) return

  const patch = computeAggregates(rows, aggregates)
  emit('update:formValues', patch)
}
</script>

<template>
  <div class="runtime-subform">
    <div class="subform-header">
      <span class="subform-title">{{ schema.label }}</span>
      <el-button v-if="!readonly" size="small" @click="addRow">
        + 添加行
      </el-button>
    </div>

    <!-- 纯 HTML 表格渲染：避免 el-table 内部 store/render 链路在反复重渲染下出现行不渲染问题 -->
    <table class="subform-table">
      <thead>
        <tr>
          <th v-for="col in schema.columns" :key="col.field">{{ col.label }}</th>
          <th v-if="!readonly" class="op-col">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="rows.length === 0">
          <td class="empty-cell" :colspan="schema.columns.length + (readonly ? 0 : 1)">
            暂无数据
          </td>
        </tr>
        <tr v-for="row in rows" :key="row.rowId">
          <td v-for="col in schema.columns" :key="col.field">
            <el-input
              v-if="col.type === 'text'"
              :model-value="row.values[col.field]"
              :disabled="readonly"
              size="small"
              @update:model-value="onCellChange(row.rowId, col.field, $event)"
            />
            <el-input-number
              v-else-if="col.type === 'number'"
              :model-value="row.values[col.field]"
              :disabled="readonly"
              :min="0"
              size="small"
              :controls="false"
              class="cell-number"
              @update:model-value="onCellChange(row.rowId, col.field, $event)"
            />
            <el-input-number
              v-else-if="col.type === 'money'"
              :model-value="row.values[col.field]"
              :disabled="readonly || isComputedColumn(col.field)"
              :min="0"
              :precision="2"
              size="small"
              :controls="false"
              class="cell-number"
              @update:model-value="onCellChange(row.rowId, col.field, $event)"
            />
            <el-select
              v-else-if="col.type === 'select'"
              :model-value="row.values[col.field]"
              :disabled="readonly"
              size="small"
              class="cell-select"
              @update:model-value="onCellChange(row.rowId, col.field, $event)"
            >
              <el-option
                v-for="opt in col.options ?? []"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <span v-else>{{ row.values[col.field] }}</span>
          </td>
          <td v-if="!readonly" class="op-col">
            <el-button
              type="danger"
              size="small"
              link
              @click="deleteRow(row.rowId)"
            >
              删除
            </el-button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.runtime-subform {
  margin-bottom: 18px;
}

.subform-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 500;
  font-size: 14px;
  color: #303133;
}

.subform-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #ebeef5;
  font-size: 12px;
  color: #606266;
}

.subform-table th,
.subform-table td {
  border: 1px solid #ebeef5;
  padding: 6px 8px;
  text-align: left;
}

.subform-table th {
  background: #f5f7fa;
  color: #909399;
  font-weight: 500;
}

.subform-table .op-col {
  width: 60px;
  text-align: center;
}

.subform-table .empty-cell {
  text-align: center;
  color: #909399;
  padding: 16px 8px;
}

.cell-number,
.cell-select {
  width: 100%;
}
</style>
