import type {
  FieldStatePatch,
  FormData,
  Rule,
  RuntimeContext,
  StatePatchMap,
} from '../types'
import { evaluateNode } from '../engine/condition-group'
import { toContextFacts } from '../runtime/runtime-context'

/**
 * Rule State Provider
 *
 * 设计原因：规则引擎的职责是"求值业务规则"，它不应该知道
 * 最终状态怎么合并、BPM 节点和权限会不会覆盖自己。
 * 因此本 Provider 执行一次全量规则求值，把所有命中规则的 then
 * 聚合成补丁表就结束 —— 只产出 Patch，不修改任何状态。
 *
 * 与 RuleScheduler 的区别：
 *   Scheduler 做增量调度（队列 + 变化传播 + 持久化状态）；
 *   本 Provider 是无状态的全量求值，两者并存、互不替代。
 *
 * 注意：BPM 规则与权限规则不应传给本 Provider
 * （它们有各自的 Provider，否则同一限制会被双重计入），
 * 这里只接收业务规则（如显隐联动、warning）。
 */
export function provideRuleState(
  rules: Rule[],
  data: FormData,
  context?: RuntimeContext,
): StatePatchMap {
  const facts: Record<string, unknown> = {
    ...(data as unknown as Record<string, unknown>),
    ...(context ? toContextFacts(context) : {}),
  }

  // source 内部顺序也要确定：按 priority 升序聚合（与引擎冲突消解语义一致）
  const ordered = [...rules].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
  )

  const patches: StatePatchMap = {}

  for (const rule of ordered) {
    if (!evaluateNode(rule.when, facts)) continue

    for (const [fieldName, rulePatch] of Object.entries(rule.then)) {
      const current = patches[fieldName] ?? {}
      // 多条规则命中同一字段：在"补丁层面"合并
      // （不能用完整空状态兜底，否则规则未表态的键也会被写入中性默认值，
      //  进而错误覆盖低优先级来源 —— 例如把 Schema 的 required:true 冲掉）
      patches[fieldName] = mergePatches(current, rulePatch)
    }
  }

  return patches
}

/**
 * 两个补丁合并（Provider 内部使用）：
 * 普通键后者覆盖；warnings 拼接去重。
 * 只处理补丁里实际出现的键，不补任何默认值。
 */
function mergePatches(a: FieldStatePatch, b: FieldStatePatch): FieldStatePatch {
  const merged: FieldStatePatch = { ...a, ...b }

  if (a.warnings || b.warnings) {
    merged.warnings = [...new Set([...(a.warnings ?? []), ...(b.warnings ?? [])])]
  }

  return merged
}
