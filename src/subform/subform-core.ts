/**
 * SubForm（子表 / 明细表）核心逻辑
 *
 * 设计原则：
 *   1. 纯函数，无 UI 依赖，可被任意宿主（demo-app / test）复用；
 *   2. rowId 由外部生成（保证稳定），内部不依赖任何 ID 生成器；
 *   3. 行内计算使用受限操作（multiply/add/subtract/divide），
 *      禁止使用 new Function() / eval() —— 生产安全边界；
 *   4. 聚合（SUM）是汇总级计算，在表格层面执行。
 *
 * 依赖边界：
 *   - 复用 Runtime Core 的 SubFormColumn / SubFormRow / SubFormSchema 类型；
 *   - 不依赖 Vue / Element Plus / ComponentMap；
 *   - 不修改 Resolver / Rule Scheduler / Dependency Graph。
 *
 * 架构边界：
 *   Rule Engine（FieldState）── 控制 visible/readonly/required
 *   Compute Engine（FormData）── 控制数据计算（本模块）
 *   Aggregation（Parent FormData）── 控制汇总（本模块）
 */
import type { SubFormRow, SubFormColumn, SubFormSchema } from '../types'

/* ─────────────────────── 受限计算模型 ─────────────────────── */

/** 受限计算操作（禁止任意表达式，生产安全） */
export type SubFormComputeOp = 'multiply' | 'add' | 'subtract' | 'divide'

/** 计算字段定义：从哪些源字段计算目标字段 */
export interface SubFormComputedField {
  targetField: string
  op: SubFormComputeOp
  sourceFields: string[]
}

/* ─────────────────────── 聚合模型 ─────────────────────── */

/** 聚合操作（第一阶段只支持 SUM） */
export type SubFormAggregateOp = 'sum'

/** 聚合定义：把某列汇总到目标字段 */
export interface SubFormAggregate {
  targetField: string
  sourceField: string
  op: SubFormAggregateOp
}

/* ─────────────────────── Row 操作 ─────────────────────── */

/**
 * 创建空行（rowId 由调用方生成）。
 * values 初始化为各列的默认值（number→0，其余→空串）。
 */
export function createRow(
  rowId: string,
  columns: SubFormColumn[],
): SubFormRow {
  const values: Record<string, unknown> = {}
  for (const col of columns) {
    values[col.field] = col.type === 'number' || col.type === 'money' ? 0 : ''
  }
  return { rowId, values }
}

/** 复制一行（rowId 新生成） */
export function cloneRow(row: SubFormRow, newRowId: string): SubFormRow {
  return { rowId: newRowId, values: { ...row.values } }
}

/** 更新行内一个字段 */
export function setRowValue(
  row: SubFormRow,
  field: string,
  value: unknown,
): SubFormRow {
  return { ...row, values: { ...row.values, [field]: value } }
}

/** 删除指定行（按 rowId） */
export function removeRow(rows: SubFormRow[], rowId: string): SubFormRow[] {
  return rows.filter((r) => r.rowId !== rowId)
}

/* ─────────────────────── 行内计算（受限） ─────────────────────── */

/**
 * 安全转换为数字：
 *   - null/undefined/'' → 0
 *   - 数字字符串 → 数字
 *   - 其他 → 0（绝不产生 NaN / Infinity）
 */
function safeNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  if (Number.isNaN(n)) return 0
  if (!Number.isFinite(n)) return 0
  return n
}

/**
 * 执行受限操作（四则运算）。
 *
 * 除零处理：除数为 0 时返回 0（明确行为，不产生 Infinity）。
 * 非数字处理：safeNumber 兜底，绝不产生 NaN / Infinity。
 */
function applyOp(op: SubFormComputeOp, operands: number[]): number {
  if (operands.length === 0) return 0

  switch (op) {
    case 'multiply':
      return operands.reduce((a, b) => a * b, 1)
    case 'add':
      return operands.reduce((a, b) => a + b, 0)
    case 'subtract':
      return operands.length === 1 ? operands[0] : operands[0] - operands.slice(1).reduce((a, b) => a + b, 0)
    case 'divide': {
      if (operands.length < 2) return 0
      const divisor = operands[1]
      if (divisor === 0) return 0 // 除零返回 0
      return operands[0] / divisor
    }
  }
}

/**
 * 执行单行的计算字段（computed fields）。
 * 例如：{ targetField: 'amount', op: 'multiply', sourceFields: ['quantity', 'price'] }
 *
 * 返回更新后的行（不修改原行）。
 */
export function computeRow(
  row: SubFormRow,
  computedFields: SubFormComputedField[],
): SubFormRow {
  let next = row
  for (const cf of computedFields) {
    const operands = cf.sourceFields.map((f) => safeNumber(next.values[f]))
    const value = applyOp(cf.op, operands)
    next = setRowValue(next, cf.targetField, value)
  }
  return next
}

/* ─────────────────────── 聚合 ─────────────────────── */

/**
 * SUM 聚合：对指定列求和。
 * 空数组返回 0；非数字值按 0 处理（绝不产生 NaN）。
 */
export function sumColumn(rows: SubFormRow[], field: string): number {
  return rows.reduce((total, row) => total + safeNumber(row.values[field]), 0)
}

/**
 * 执行表格级聚合，把结果写回顶层 formValues。
 *
 * 例如：
 *   aggregates: [
 *     { targetField: 'totalAmount', sourceField: 'amount', op: 'sum' }
 *   ]
 *
 * 返回 formValues 的补丁对象（可合并到主 formData）。
 * 不修改 rows，不修改原 formData，返回新对象。
 */
export function computeAggregates(
  rows: SubFormRow[],
  aggregates: SubFormAggregate[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const agg of aggregates) {
    if (agg.op === 'sum') {
      result[agg.targetField] = sumColumn(rows, agg.sourceField)
    }
  }
  return result
}

/* ─────────────────────── Schema 辅助 ─────────────────────── */

/**
 * 从 SubFormSchema 提取计算字段定义。
 * 优先使用 schema.computedFields；若不存在则从 column.props?.expression 迁移（向后兼容）。
 */
export function extractComputedFields(
  subForm: SubFormSchema,
): SubFormComputedField[] {
  // 正式定义
  if (subForm.computedFields?.length) {
    return subForm.computedFields
  }

  // 向后兼容：从 column.props.expression 迁移（旧格式）
  return subForm.columns
    .filter((col) => typeof col.props?.expression === 'string')
    .map((col) => {
      const expr = col.props!.expression as string
      // 简单解析 "a * b" / "a + b" 格式
      const parts = expr.split(/\s*([+\-*/])\s*/).filter(Boolean)
      if (parts.length >= 3) {
        const [a, op, b] = parts
        const opMap: Record<string, SubFormComputeOp> = {
          '*': 'multiply',
          '+': 'add',
          '-': 'subtract',
          '/': 'divide',
        }
        const computeOp = opMap[op]
        if (computeOp) {
          return {
            targetField: col.field,
            op: computeOp,
            sourceFields: [a, b],
          }
        }
      }
      // 无法解析的表达式忽略（安全兜底）
      return null
    })
    .filter((x): x is SubFormComputedField => x !== null)
}
