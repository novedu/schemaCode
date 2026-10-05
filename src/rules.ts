import type { Rule } from './types'
import { cond } from './engine/condition-evaluator'
import { and, or } from './engine/condition-group'

/**
 * 规则集合
 * 每条规则都是一个产生式：when（条件树/左部）→ then（动作/右部）。
 * 规则之间互相独立，不知道彼此存在 —— 这正是规则引擎可插拔的原因。
 *
 * 三条业务规则都显式声明 priority: 10；
 * 将来加入的兜底/默认规则可以留在默认优先级 0，
 * 与具体规则冲突时自动让位，而不需要调换数组顺序。
 */
export const rules: Rule[] = [
  {
    name: '个人客户：公司名称隐藏，且不必填',
    priority: 10,
    // equals
    when: cond('customerType', 'equals', 'person'),
    then: {
      companyName: { visible: false, required: false },
    },
  },
  {
    name: '公司客户：公司名称显示，且必填',
    priority: 10,
    // equals
    when: cond('customerType', 'equals', 'company'),
    then: {
      companyName: { visible: true, required: true },
    },
  },
  {
    name: '公司客户 且（注册资本 > 1000 万 或 已填写公司名称）：显示 VIP 标识',
    priority: 10,
    // and / or 嵌套 + greaterThan + notEmpty：
    //   customerType = company AND (registeredCapital > 1000 OR companyName 非空)
    when: and(
      cond('customerType', 'equals', 'company'),
      or(
        cond('registeredCapital', 'greaterThan', 1000),
        cond('companyName', 'notEmpty'),
      ),
    ),
    then: {
      vipTag: { visible: true },
    },
  },
]
