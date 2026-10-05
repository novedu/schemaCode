import type { Rule } from '../types'
import { cond } from '../engine/condition-evaluator'
import { CTX } from '../runtime/runtime-context'

/**
 * BPM 规则层：字段状态由"当前流程节点"决定。
 *
 * 这一层只认识流程节点，不认识角色、不认识权限总开关 ——
 * 那些是 permission-rules 的职责，避免把 BPM 和权限揉进同一条规则。
 */

/** 员工填写节点：金额开放编辑，且必填 */
export const bpmRules: Rule[] = [
  {
    name: 'BPM·employee_fill：报销金额可编辑、必填',
    priority: 20,
    when: cond(CTX.node, 'equals', 'employee_fill'),
    then: {
      amount: { editable: true, readonly: false, required: true },
    },
  },
  {
    name: 'BPM·manager_approve：报销金额只读、仍必填',
    priority: 20,
    when: cond(CTX.node, 'equals', 'manager_approve'),
    then: {
      amount: { readonly: true, editable: false, required: true },
    },
  },
]
