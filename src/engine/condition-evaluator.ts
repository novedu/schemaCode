import type { Condition, OperatorName } from '../types'
import { getOperator } from './operators'

/**
 * 第 2 层：Condition Evaluator（条件求值器）
 *
 * 职责仅限一个叶子条件：
 *   1. 按 condition.field 从 FormData 中取出实际值
 *   2. 按 condition.operator 找到操作符
 *   3. 让操作符对 (实际值, 期望值) 下结论
 *
 * 它不关心条件是被 and 还是 or 包着 —— 那是上一层的事。
 */
export function evaluateCondition(
  condition: Condition,
  data: Record<string, unknown>,
): boolean {
  const actual = data[condition.field]
  return getOperator(condition.operator)(actual, condition.value)
}

/** 叶子条件的构造小工具：cond('customerType', 'equals', 'company') */
export function cond(
  field: string,
  operator: OperatorName,
  value?: unknown,
): Condition {
  return { kind: 'condition', field, operator, value }
}
