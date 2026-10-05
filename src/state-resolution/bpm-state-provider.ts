import type { RuntimeContext, StatePatchMap } from '../types'

/**
 * BPM State Provider
 *
 * 设计原因：流程节点对字段的约束（"审批节点金额只读"）属于流程语义，
 * 不是业务规则，也不认识具体用户。把它写成独立来源后：
 *   - 不依赖 RuleEngine（没有条件树、没有规则注册）；
 *   - 节点 → 字段补丁的映射一目了然，便于和 BPM 流程图对齐；
 *   - 它的优先级高于业务规则、低于安全权限，由 Resolver 统一裁决。
 */

/** 节点 → 该节点施加的字段补丁 */
const nodeStateTable: Record<string, StatePatchMap> = {
  // 员工填写节点：金额开放编辑
  employee_fill: {
    amount: { editable: true, readonly: false },
  },
  // 经理审批节点：金额只读（值仍提交，只是不可改），自然不可编辑
  manager_approve: {
    amount: { readonly: true, editable: false },
  },
}

export function provideBpmState(context: RuntimeContext): StatePatchMap {
  const nodePatches = nodeStateTable[context.task.node]
  if (!nodePatches) return {} // 未知节点不表态，而不是猜测一个默认限制

  // 浅拷贝，避免调用方意外修改节点表
  return Object.fromEntries(
    Object.entries(nodePatches).map(([field, patch]) => [field, { ...patch }]),
  )
}
