import type { Rule } from '../types'
import { cond } from '../engine/condition-evaluator'

/**
 * 业务预警规则层：不改变显隐/必填，只往 warnings 追加非阻断提示。
 * warnings 是数组，合并时拼接，多条预警可共存。
 */
export const warningRules: Rule[] = [
  {
    name: '预警·报销金额 > 5000：提示需附发票',
    priority: 10,
    when: cond('amount', 'greaterThan', 5000),
    then: {
      amount: {
        warnings: ['金额超过 5000 元，请补充上传发票并填写事由'],
      },
    },
  },
]
