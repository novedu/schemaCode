import type { ConditionNode, Rule } from '../types'

/**
 * Dependency Graph（依赖图）
 *
 * 一条规则在数据流上有两种边，方向必须分清：
 *
 *   输入边（when / 条件）
 *     Rule  读取 → 字段        extractReferencedFields 递归提取
 *     字段  被读取 → Rule      （反向索引）
 *     回答："字段 A 的值变了，哪些规则需要重新求值？"
 *
 *   输出边（then / 动作）
 *     Rule  写入 → 字段        then 的键，扁平提取
 *     字段  被写入 → Rule      （反向索引）
 *     回答："字段 A 的最终状态是由哪些规则决定的？"
 *
 * 同一个字段可以同时出现在两种边里（规则 X 读它、规则 Y 写它），
 * 两种索引各自独立，互不混淆。
 *
 * 本模块只做"图的构建与查询"，不触发规则、不改 FieldState。
 */

/**
 * 递归提取一棵条件树中引用到的全部输入字段（去重，保持首次出现顺序）。
 *
 * - 叶子 condition：引用就是它自己的 field
 * - 组 group：引用 = 所有子节点引用的并集（and/or 不影响引用集合）
 *
 * 递归天然支持任意层级的 AND / OR 嵌套。
 */
export function extractReferencedFields(node: ConditionNode): string[] {
  const fields: string[] = []

  const walk = (n: ConditionNode) => {
    if (n.kind === 'condition') {
      if (!fields.includes(n.field)) fields.push(n.field)
      return
    }
    for (const child of n.children) walk(child)
  }

  walk(node)
  return fields
}

/**
 * 提取一条规则的输出字段：then 中被写入状态的字段。
 * then 本身是"字段 → 状态补丁"的扁平映射，直接取键即可，无需递归。
 */
export function extractOutputFields(rule: Rule): string[] {
  return Object.keys(rule.then)
}

/** 依赖图：维护输入/输出两套正反向索引 */
export class DependencyGraph {
  /* ── 输入边 ── */
  /** 反向索引：输入字段 → 读取它的规则集合 */
  private readonly inputFieldToRules = new Map<string, Set<string>>()
  /** 正向索引：规则 → 它读取的输入字段 */
  private readonly ruleToInputFields = new Map<string, string[]>()

  /* ── 输出边 ── */
  /** 正向索引：规则 → 它写入的输出字段 */
  private readonly ruleToOutputFields = new Map<string, string[]>()
  /** 反向索引：输出字段 → 写入它的规则集合 */
  private readonly outputFieldToRules = new Map<string, Set<string>>()

  constructor(rules: Rule[]) {
    for (const rule of rules) {
      // 输入边：when 条件树递归提取
      const inputFields = extractReferencedFields(rule.when)
      this.ruleToInputFields.set(rule.name, inputFields)
      for (const field of inputFields) {
        this.addToIndex(this.inputFieldToRules, field, rule.name)
      }

      // 输出边：then 的键
      const outputFields = extractOutputFields(rule)
      this.ruleToOutputFields.set(rule.name, outputFields)
      for (const field of outputFields) {
        this.addToIndex(this.outputFieldToRules, field, rule.name)
      }
    }
  }

  /** 往"字段 → 规则集合"索引里登记一条边 */
  private addToIndex(index: Map<string, Set<string>>, field: string, ruleName: string) {
    const set = index.get(field) ?? new Set<string>()
    set.add(ruleName)
    index.set(field, set)
  }

  /* ───────────────────── 输入边查询 ───────────────────── */

  /** 某输入字段变化时，需要重新求值的全部规则名 */
  getRulesDependingOn(field: string): string[] {
    return [...(this.inputFieldToRules.get(field) ?? [])]
  }

  /** 某条规则读取了哪些输入字段 */
  getInputFieldsOfRule(ruleName: string): string[] {
    return [...(this.ruleToInputFields.get(ruleName) ?? [])]
  }

  /** 判断某规则是否读取某字段 */
  dependsOn(field: string, ruleName: string): boolean {
    return this.inputFieldToRules.get(field)?.has(ruleName) ?? false
  }

  /** 至少被一条规则读取的全部输入字段 */
  getAllInputFields(): string[] {
    return [...this.inputFieldToRules.keys()]
  }

  /* ───────────────────── 输出边查询 ───────────────────── */

  /** 某条规则写入了哪些输出字段（Rule → 输出字段） */
  getOutputFieldsOfRule(ruleName: string): string[] {
    return [...(this.ruleToOutputFields.get(ruleName) ?? [])]
  }

  /** 哪些规则会写入某字段（输出字段 → 规则），即该字段状态的"生产者" */
  getRulesProducingField(field: string): string[] {
    return [...(this.outputFieldToRules.get(field) ?? [])]
  }

  /** 至少被一条规则写入的全部输出字段 */
  getAllOutputFields(): string[] {
    return [...this.outputFieldToRules.keys()]
  }
}

/** 函数式入口：从规则集合构建依赖图 */
export function buildDependencyGraph(rules: Rule[]): DependencyGraph {
  return new DependencyGraph(rules)
}
