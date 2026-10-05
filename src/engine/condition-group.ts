import type { ConditionGroup, ConditionNode } from '../types'
import { evaluateCondition } from './condition-evaluator'

/**
 * 第 3 层：Condition Group（条件组求值器）
 *
 * 递归遍历条件 AST：
 *   - 遇到叶子 condition → 交给第 2 层 Condition Evaluator
 *   - 遇到 group
 *       and → every（所有子节点都为真）
 *       or  → some（任一子节点为真）
 *
 * 因为树可以无限嵌套，天然表达括号优先级，例如：
 *   A AND (B OR C)
 *     group(and)
 *       ├─ A
 *       └─ group(or)
 *            ├─ B
 *            └─ C
 */
export function evaluateNode(
  node: ConditionNode,
  data: Record<string, unknown>,
): boolean {
  if (node.kind === 'condition') {
    return evaluateCondition(node, data)
  }

  return node.combinator === 'and'
    ? node.children.every((child) => evaluateNode(child, data))
    : node.children.some((child) => evaluateNode(child, data))
}

/** 别名：语义上对"一组条件"求值 */
export const evaluateGroup = evaluateNode

/** and 组构造器 */
export function and(...children: ConditionNode[]): ConditionGroup {
  return { kind: 'group', combinator: 'and', children }
}

/** or 组构造器 */
export function or(...children: ConditionNode[]): ConditionGroup {
  return { kind: 'group', combinator: 'or', children }
}
