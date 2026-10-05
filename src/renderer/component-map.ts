import type { Component } from 'vue'
import { MoneyInput, NumberInput, SelectInput, TextInput } from './vue-components'

/**
 * ComponentMap（组件注册表）
 *
 * 低代码的核心解耦点：Schema 只写组件名（字符串），
 * 组件名 → 真实 Vue 组件的映射在这张表里维护。
 * 替换组件库（如把自研 MoneyInput 换成 Element Plus 的）
 * 只改注册表，Schema 与规则都不动。
 */

export interface ComponentEntry {
  component: Component
  /** 组件默认属性：会被 Schema 的 props 覆盖 */
  defaultProps?: Record<string, unknown>
}

/** 组件名 → 组件条目 */
export const componentMap: Record<string, ComponentEntry> = {
  TextInput: { component: TextInput },
  NumberInput: { component: NumberInput },
  SelectInput: { component: SelectInput },
  MoneyInput: {
    component: MoneyInput,
    defaultProps: { precision: 2, currency: 'CNY' },
  },
}

/** 字段类型 → 兜底组件（Schema 未显式指定 component 时使用） */
export const fallbackComponents: Record<string, string> = {
  text: 'TextInput',
  number: 'NumberInput',
  select: 'SelectInput',
}

/** 按名字取组件条目，未注册直接报错（fail fast） */
export function resolveComponentEntry(name: string): ComponentEntry {
  const entry = componentMap[name]
  if (!entry) throw new Error(`组件未在 ComponentMap 中注册: ${name}`)
  return entry
}

/** 解析一个字段应该使用的组件名（显式 component 优先，否则按 type 兜底） */
export function resolveComponentName(
  field: { component?: string; type: string },
): string {
  if (field.component) return field.component
  return fallbackComponents[field.type] ?? 'TextInput'
}
