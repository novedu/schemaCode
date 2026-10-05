import type { ConditionNode, Rule } from '@runtime-core/types'
import {
  createGroup,
  createLeaf,
  createRuleId,
  type DesignerConditionNode,
  type FieldAction,
  type RuleDoc,
  toCoreCondition,
} from './rule-model'

/**
 * Rule Builder（规则产物装配）
 *
 * 设计期 RuleDoc[] → Runtime Core Rule[]。
 * 与 schema-builder 同构：产物不是"长得像规则"的自定义格式，
 * 而是核心 Rule 类型本身（name/priority/when/then），
 * 导出后可被 demo-app 直接传入核心 RuleEngine 执行。
 */

/** 单条文档 → 核心 Rule */
export function buildRule(doc: RuleDoc): Rule {
  return {
    name: doc.name,
    priority: doc.priority,
    when: toCoreCondition(doc.when),
    then: doc.then,
  }
}

/** 文档集合 → 核心 Rule[] */
export function buildRules(docs: RuleDoc[]): Rule[] {
  return docs.map(buildRule)
}

/* ─────────────────────── 校验 ─────────────────────── */

export interface RuleValidation {
  valid: boolean
  /** 字段名重复以外的结构性问题（面向作者的中文提示） */
  errors: string[]
}

/**
 * 导出前静态校验（不执行引擎，只检查"这条规则配没配完整"）：
 *   - 至少存在一个叶子，且每个叶子都填了字段；
 *   - 每个组至少有一个子节点；
 *   - then 至少声明了一个目标字段。
 */
export function validateRuleDoc(doc: RuleDoc): RuleValidation {
  const errors: string[] = []
  const leaves: DesignerConditionNode[] = []

  collectLeaves(doc.when, leaves)

  if (leaves.length === 0) {
    errors.push('条件树为空，请至少添加一个条件')
  } else {
    for (const leaf of leaves) {
      if (leaf.kind === 'condition' && leaf.field.trim() === '') {
        errors.push('存在未选择字段的条件')
        break
      }
    }
  }

  const emptyGroup = findEmptyGroup(doc.when)
  if (emptyGroup) errors.push('存在没有子条件的 AND/OR 组')

  if (Object.keys(doc.then).length === 0) {
    errors.push('动作为空，请至少配置一个目标字段')
  }

  return { valid: errors.length === 0, errors }
}

function collectLeaves(node: DesignerConditionNode, acc: DesignerConditionNode[]): void {
  if (node.kind === 'condition') {
    acc.push(node)
    return
  }
  for (const child of node.children) collectLeaves(child, acc)
}

function findEmptyGroup(node: DesignerConditionNode): boolean {
  if (node.kind === 'group') {
    if (node.children.length === 0) return true
    return node.children.some(findEmptyGroup)
  }
  return false
}

/* ─────────────────────── 反向解析（导入继续设计） ─────────────────────── */

/** 核心 ConditionNode → 设计期树（补 nodeId） */
export function fromCoreCondition(node: ConditionNode): DesignerConditionNode {
  if (node.kind === 'group') {
    return createGroup(node.combinator, node.children.map(fromCoreCondition))
  }
  return createLeaf(node.field, node.operator, node.value)
}

/** 核心 Rule → 设计期文档（then 是纯补丁表，直接沿用） */
export function fromCoreRule(rule: Rule): RuleDoc {
  return {
    id: createRuleId(),
    name: rule.name,
    priority: rule.priority ?? 0,
    when: fromCoreCondition(rule.when),
    then: rule.then as Record<string, FieldAction>,
  }
}
