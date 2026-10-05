import type { FieldState, FormData, Schema } from '../types'

/** 单字段校验错误（结构化，方便 UI 直接定位到字段） */
export interface FieldError {
  field: string
  label: string
  message: string
}

/** 校验结论：合法标记 + 错误明细 */
export interface ValidationResult {
  valid: boolean
  errors: FieldError[]
}

/**
 * 校验阶段（Validation）—— 与规则引擎（Rule Engine）严格分离。
 *
 * 两者回答的是两个不同的问题：
 *   规则引擎：在这份数据下，字段"应该是什么状态"？（visible / required）
 *   校验器  ：在当前状态下，这份数据"合不合法"？
 *
 * 依赖方向是单向的：校验器消费引擎的产物 FieldState，
 * 自己绝不做条件推理、绝不修改状态。将来加正则、长度、跨字段校验，
 * 都在本模块内扩展，引擎一行都不用动。
 */
export function validateForm(
  schema: Schema,
  data: FormData,
  fieldStates: Record<string, FieldState>,
): ValidationResult {
  const facts = data as unknown as Record<string, unknown>
  const errors: FieldError[] = []

  for (const field of schema.fields) {
    const state = fieldStates[field.name]

    if (!state.visible) continue // 不可见 → 不参与校验
    const value = facts[field.name]

    // 必填校验：可见 + required + 值为空
    if (state.required && (value === '' || value == null)) {
      errors.push({
        field: field.name,
        label: field.label,
        message: `「${field.label}」为必填项`,
      })
    }
  }

  return { valid: errors.length === 0, errors }
}
