import type { Schema, StatePatchMap } from '../types'

/**
 * Schema State Provider
 *
 * 设计原因：在旧链路里 Schema 的 initialState 被直接复制进最终状态，
 * 与规则/BPM/权限的产物混在一起合并，无法回答
 * "这个键到底是谁决定的、谁有权推翻谁"。
 *
 * 现在 Schema 不再特殊：它与其它来源一样，只产出一份补丁表。
 * Schema 是最低优先级来源（默认配置），任何上层来源都可以覆盖它。
 */
export function provideSchemaState(schema: Schema): StatePatchMap {
  const patches: StatePatchMap = {}

  for (const field of schema.fields) {
    // initialState 是完整状态，整体作为补丁输出（含默认值与 warnings:[]）
    patches[field.name] = { ...field.initialState }
  }

  return patches
}
