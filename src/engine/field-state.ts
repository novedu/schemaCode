import type { FieldState } from '../types'

/**
 * FieldState 工厂与合并语义
 *
 * 独立成文件的原因：线性引擎与增量调度器必须共用同一套合并规则，
 * 否则同一套规则在两条执行路径下会得出不同结论。
 */

/** 基线状态：默认可见、可编辑、不必填、无提示 */
export function defaultFieldState(overrides: Partial<FieldState> = {}): FieldState {
  return {
    visible: true,
    required: false,
    disabled: false,
    readonly: false,
    editable: true,
    warnings: [],
    ...overrides,
  }
}

/**
 * 把一个状态补丁合并进基状态。
 *
 * 普通键：补丁覆盖基线（与之前一致）；
 * warnings：数组拼接并按消息去重 —— warning 是"追加一条提示"，
 * 多规则命中时所有提示都应保留，而不是互相覆盖。
 */
export function mergeFieldState(base: FieldState, patch: Partial<FieldState>): FieldState {
  const merged: FieldState = { ...base, ...patch }

  if (patch.warnings) {
    merged.warnings = [...new Set([...base.warnings, ...patch.warnings])]
  }

  return merged
}

/** 两个状态是否不同（含 warnings 内容差异） */
export function isFieldStateChanged(a: FieldState, b: FieldState): boolean {
  if (a.visible !== b.visible) return true
  if (a.required !== b.required) return true
  if (a.disabled !== b.disabled) return true
  if (a.readonly !== b.readonly) return true
  if (a.editable !== b.editable) return true

  const wa = a.warnings
  const wb = b.warnings
  return wa.length !== wb.length || wa.some((w, i) => w !== wb[i])
}
