import type { FieldState, FormData, Rule, Schema } from '../types'
import { evaluateNode } from './condition-group'
import { mergeFieldState } from './field-state'

/** 引擎推理结果：字段状态 + 命中轨迹（用于调试/审计，不是校验结论） */
export interface EngineResult {
  fieldStates: Record<string, FieldState>
  firedRules: string[]
}

const DEFAULT_PRIORITY = 0

/**
 * 规则引擎：正向推理（forward chaining）
 *
 * 输入：
 *   Schema    —— 提供每个字段的初始状态（工作内存的初始内容）
 *   FormData  —— 当前事实
 *   Rules     —— 规则库（每条规则带 priority，when 是一棵条件树）
 *
 * 推理过程：
 *   1. 用 Schema 的 initialState 建立基线状态
 *   2. 冲突消解（conflict resolution）：
 *      按 priority 升序排列命中规则 —— 低优先级先合并、高优先级后合并，
 *      后合并的覆盖先合并的，所以高优先级在冲突键上胜出；
 *      priority 相同时按声明顺序（稳定排序），靠后者胜出。
 *   3. 依次求值条件、触发动作、合并 patch
 *
 * 输出：
 *   ④ FieldState —— 推理结论，一个 name → 状态 的映射
 *
 * 注意：本文件不含任何"值合不合法"的判断，那是 validation 层的职责。
 */
export function runRuleEngine(
  schema: Schema,
  data: FormData,
  rules: Rule[],
): EngineResult {
  const facts = data as unknown as Record<string, unknown>

  // 1. 模式匹配前：以 Schema 作为基线
  const fieldStates: Record<string, FieldState> = {}
  for (const field of schema.fields) {
    fieldStates[field.name] = { ...field.initialState }
  }

  // 2. 冲突消解：按 priority 排序（附带原始下标，同优先级保持声明顺序）
  const ordered = rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => {
      const pa = a.rule.priority ?? DEFAULT_PRIORITY
      const pb = b.rule.priority ?? DEFAULT_PRIORITY
      return pa - pb || a.index - b.index
    })

  // 3. 匹配 → 触发 → 合并（patch merge）
  const firedRules: string[] = []
  for (const { rule } of ordered) {
    if (evaluateNode(rule.when, facts)) {
      firedRules.push(rule.name)
      for (const [fieldName, patch] of Object.entries(rule.then)) {
        fieldStates[fieldName] = mergeFieldState(fieldStates[fieldName], patch)
      }
    }
  }

  return { fieldStates, firedRules }
}
