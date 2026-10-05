import type { Rule } from '../types'
import { cond } from '../engine/condition-evaluator'
import { and } from '../engine/condition-group'
import { CTX } from '../runtime/runtime-context'

/**
 * 权限规则层：字段状态由"角色 + 权限总开关"决定。
 *
 * 与 BPM 层正交：
 *   BPM 层回答"这个节点业务上让不让改"；
 *   权限层回答"这个人/这个实例有没有资格改"。
 * 两层独立求值，最终在 FieldState 上叠加。
 */
export const permissionRules: Rule[] = [
  {
    // 经理角色：审批意见显示、必填、可编辑
    name: '权限·经理：审批意见可见/必填/可编辑',
    priority: 15,
    when: cond(CTX.role('manager'), 'equals', true),
    then: {
      approveComment: { visible: true, required: true, editable: true },
    },
  },
  {
    // 员工角色：审批意见对员工不可见
    name: '权限·员工：审批意见隐藏',
    priority: 15,
    when: cond(CTX.role('employee'), 'equals', true),
    then: {
      approveComment: { visible: false },
    },
  },
  {
    // 全局只读实例（后端 permissions.editable=false）：所有字段控件禁用
    name: '权限·只读实例：报销金额禁用',
    priority: 30, // 最高：实例级权限压过节点语义
    when: and(
      cond(CTX.editable, 'equals', false),
      cond(CTX.node, 'equals', 'employee_fill'),
    ),
    then: {
      amount: { disabled: true, editable: false },
    },
  },
]
