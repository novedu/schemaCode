import { h, type Component, type VNode } from 'vue'
import type { FieldSchema, FieldState, FormData, Schema } from '../types'
import { resolveComponentEntry, resolveComponentName } from './component-map'

/**
 * Renderer（渲染器）
 *
 * 完成装配链路的最后一段：
 *
 *   Schema ── ComponentMap ──▶ FieldRenderConfig（渲染配置）
 *                                   │ 再叠加当前值 + FieldState
 *                                   ▼
 *                              Vue VNode（可直接放进 Vue 模板）
 *
 * Renderer 不做推理：状态来自引擎、值来自 FormData，
 * 它只负责"翻译"成 Vue 认识的 VNode。
 */

/** 单个字段的渲染配置（设计器→运行时的中间产物） */
export interface FieldRenderConfig {
  field: string
  label: string
  componentName: string
  component: Component
  /** 已合并默认值与 Schema 配置的静态 props */
  props: Record<string, unknown>
  options?: { label: string; value: string }[]
}

/**
 * Schema → 渲染配置
 * 对每个字段：解析组件名 → 查 ComponentMap → 合并默认 props 与 Schema props。
 */
export function buildRenderConfigs(schema: Schema): FieldRenderConfig[] {
  return schema.fields.map((field) => {
    const componentName = resolveComponentName(field)
    const entry = resolveComponentEntry(componentName)

    return {
      field: field.name,
      label: field.label,
      componentName,
      component: entry.component,
      props: { ...entry.defaultProps, ...field.props },
      options: field.options,
    }
  })
}

/**
 * FieldState → 组件动态 props
 * 只翻译三个控制量；不可见字段不会走到这里（由 renderForm 过滤）。
 */
function stateToProps(state: FieldState): Record<string, unknown> {
  return {
    disabled: state.disabled,
    readonly: state.readonly,
  }
}

/** 渲染单个字段：h(组件, { 值 + 静态配置 + 动态状态 }) → 真实 VNode */
export function renderField(
  config: FieldRenderConfig,
  value: unknown,
  state: FieldState,
): VNode {
  return h(config.component, {
    modelValue: value,
    ...config.props,
    ...(config.options ? { options: config.options } : {}),
    ...stateToProps(state),
  })
}

/**
 * 渲染整张表单
 *
 * @returns 可见字段的 VNode 列表（顺序即 Schema 顺序）；
 * visible=false 的字段直接跳过，与"隐藏字段不参与校验"语义一致。
 */
export function renderForm(
  schema: Schema,
  data: FormData,
  states: Record<string, FieldState>,
): { field: string; vnode: VNode }[] {
  const facts = data as unknown as Record<string, unknown>
  const configs = buildRenderConfigs(schema)
  const rendered: { field: string; vnode: VNode }[] = []

  for (const config of configs) {
    const state = states[config.field]
    if (!state.visible) continue

    rendered.push({
      field: config.field,
      vnode: renderField(config, facts[config.field], state),
    })
  }

  return rendered
}
