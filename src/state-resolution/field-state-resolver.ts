import type {
  FieldState,
  FieldStatePatch,
  Schema,
  StateSource,
  StateSourceName,
} from '../types'
import { defaultFieldState } from '../engine/field-state'

/**
 * FieldStateResolver（字段状态决策引擎）
 *
 * 接收多个来源（各自只产出补丁），裁决出最终 FieldState。
 *
 * 优先级（从低到高，应用时从最低开始逐层叠加）：
 *
 *   Schema  —— 默认配置，任何上层都可以推翻；
 *   Rule    —— 业务规则控制的业务状态；
 *   BPM     —— 流程节点限制业务行为（审批节点只读等）；
 *   Permission —— 安全限制，最高优先级，谁也不能推翻。
 *
 * 不使用 Object.assign 的原因：
 *   1. warnings 语义不同，必须拼接去重而非覆盖；
 *   2. 合并后需要语义规范化（只读/禁用必然不可编辑）；
 *   3. 优先级必须写在代码契约里，而不是依赖调用方传参顺序。
 */

/** 优先级低 → 高；Resolver 只相信这张表，不相信 sources 数组顺序 */
const SOURCE_PRECEDENCE: StateSourceName[] = [
  'schema',
  'rule',
  'bpm',
  'permission',
]

export interface ResolveOptions {
  /** 为调试/审计保留每个字段的来源决策轨迹 */
  trace?: boolean
}

export interface FieldDecisionTrace {
  field: string
  /** 最终值由哪个来源最后决定（warnings 除外，它可能来自多个来源） */
  decidedBy: Partial<Record<keyof FieldState, StateSourceName>>
}

export interface ResolveResult {
  fieldStates: Record<string, FieldState>
  traces: FieldDecisionTrace[]
}

export function resolveFieldStates(
  schema: Schema,
  sources: StateSource[],
  options: ResolveOptions = {},
): ResolveResult {
  // 按显式优先级排序来源；同一优先级（实际不会重复）保持稳定
  const ordered = [...sources].sort(
    (a, b) =>
      SOURCE_PRECEDENCE.indexOf(a.name) - SOURCE_PRECEDENCE.indexOf(b.name),
  )

  const result: Record<string, FieldState> = {}
  const traces: FieldDecisionTrace[] = []

  for (const field of schema.fields) {
    // 以中性默认值为基线，字段即使没被任何来源提到也有完整状态
    let state = defaultFieldState()
    const decidedBy: Partial<Record<keyof FieldState, StateSourceName>> = {}

    for (const source of ordered) {
      const patch = source.patches[field.name]
      if (!patch) continue

      state = applyPatch(state, patch)
      // 记录本来源表态了哪些键（后记录的即高优先级，最终留下的就是决策者）
      for (const key of Object.keys(patch) as (keyof FieldStatePatch)[]) {
        decidedBy[key] = source.name
      }
    }

    state = normalizeState(state)

    result[field.name] = state
    if (options.trace) traces.push({ field: field.name, decidedBy })
  }

  return { fieldStates: result, traces }
}

/**
 * 应用一个补丁到字段状态。
 *
 * 普通键（visible/required/readonly/editable/disabled）：
 *   补丁出现即覆盖 —— 因为调用顺序已按优先级排好，覆盖即"高优先级胜出"。
 *
 * warnings：
 *   拼接后按消息去重。warning 是非阻断提示，两个来源的提示应当共存，
 *   不能用来源优先级互相抹掉。
 */
function applyPatch(state: FieldState, patch: FieldStatePatch): FieldState {
  const merged: FieldState = { ...state, ...patch }

  if (patch.warnings) {
    merged.warnings = [...new Set([...state.warnings, ...patch.warnings])]
  } else {
    merged.warnings = [...state.warnings]
  }

  return merged
}

/**
 * 语义规范化（合并后的最后一道工序）：
 *
 *   readonly = true 或 disabled = true 时，editable 必须为 false。
 *
 * 这解决了冲突案例 1 的场景：Schema 声明 editable=true，
 * BPM 只声明 readonly=true 而未显式写 editable，
 * 最终状态必须自洽 —— 只读字段在语义上不可能可编辑。
 */
function normalizeState(state: FieldState): FieldState {
  if (state.readonly || state.disabled) {
    return { ...state, editable: false }
  }
  return state
}
