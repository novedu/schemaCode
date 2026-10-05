import type {
  ConditionGroup,
  ConditionNode as CoreConditionNode,
  FieldState,
  OperatorName,
} from '@runtime-core/types'

/**
 * Rule Model（规则设计器模型）
*
* 与 Schema Designer 同一套建模纪律：
*
*   1. 设计期结构 = 核心契约 + 编辑所需的 nodeId/id；
*   2. 所有变更走纯不可变函数（store 只替换引用）；
*   3. 导出时递归剥离编辑字段，产物就是 Runtime Core 的原生 Rule，
*      核心侧零改动即可加载执行。
*
* 核心 ConditionGroup 的连接符字段叫 combinator（不是 operator）。
* 需求口述中的 "operator:'and'" 在产物层必须落成 combinator:'and'，
* 否则核心 evaluateNode 无法识别——以可执行契约为准。
*/

/* ─────────────────────── 设计期条件树 ─────────────────────── */

/** 设计期叶子：核心 Condition 形状 + nodeId（仅编辑/递归定位用） */
export interface DesignerCondition {
  kind: 'condition'
  nodeId: string
  field: string
  operator: OperatorName
  value?: unknown
}

/** 设计期条件组：核心 ConditionGroup 形状 + nodeId */
export interface DesignerGroup {
  kind: 'group'
  nodeId: string
  combinator: 'and' | 'or'
  children: DesignerConditionNode[]
}

export type DesignerConditionNode = DesignerCondition | DesignerGroup

/** 字段动作：对一个目标字段的 FieldState 补丁（本阶段开放布尔状态键） */
export type FieldAction = Partial<
  Pick<FieldState, 'visible' | 'required' | 'disabled' | 'readonly' | 'editable'>
>

/** 设计期规则文档（一条产生式规则） */
export interface RuleDoc {
  id: string
  name: string
  /** 优先级：多条规则动作冲突时大者胜出（核心冲突消解语义） */
  priority: number
  when: DesignerConditionNode
  /** 目标字段 → 状态补丁 */
  then: Record<string, FieldAction>
}

/* ─────────────────────── ID ─────────────────────── */

let nodeSeq = 0
let ruleSeq = 0

/** 编辑节点 id（时间戳 + 自增序号，避免同毫秒碰撞） */
export function createNodeId(): string {
  nodeSeq += 1
  return `cn_${Date.now().toString(36)}_${nodeSeq}`
}

export function createRuleId(): string {
  ruleSeq += 1
  return `rule_${Date.now().toString(36)}_${ruleSeq}`
}

/* ─────────────────────── 工厂 ─────────────────────── */

/** 新建叶子条件 */
export function createLeaf(
  field = '',
  operator: OperatorName = 'equals',
  value?: unknown,
): DesignerCondition {
  return { kind: 'condition', nodeId: createNodeId(), field, operator, value }
}

/** 新建条件组（默认空，可由调用方塞入初始子节点） */
export function createGroup(
  combinator: 'and' | 'or' = 'and',
  children: DesignerConditionNode[] = [],
): DesignerGroup {
  return { kind: 'group', nodeId: createNodeId(), combinator, children }
}

/** 新建规则：默认根为 AND 组 + 一个空叶子，开箱即可继续加条件 */
export function createRuleDoc(name = '新规则'): RuleDoc {
  return {
    id: createRuleId(),
    name,
    priority: 10,
    when: createGroup('and', [createLeaf()]),
    then: {},
  }
}

/* ─────────────────────── 查询 ─────────────────────── */

export function isGroup(node: DesignerConditionNode): node is DesignerGroup {
  return node.kind === 'group'
}

/** 深度查找节点 */
export function findNode(
  root: DesignerConditionNode,
  nodeId: string,
): DesignerConditionNode | null {
  if (root.nodeId === nodeId) return root
  if (isGroup(root)) {
    for (const child of root.children) {
      const hit = findNode(child, nodeId)
      if (hit) return hit
    }
  }
  return null
}

/* ─────────────────────── 不可变变更 ─────────────────────── */

/** 叶子 patch 类型 */
export type LeafPatch = Partial<Pick<DesignerCondition, 'field' | 'operator' | 'value'>>
/** 组 patch 类型 */
export type GroupPatch = Partial<Pick<DesignerGroup, 'combinator'>>

/**
 * 更新树中任意节点：
 *   叶子可改 field/operator/value；组可改 combinator。
 * 路径外节点保持同一引用（结构共享）。
 */
export function updateNode(
  root: DesignerConditionNode,
  nodeId: string,
  patch: LeafPatch & GroupPatch,
): DesignerConditionNode {
  if (root.nodeId === nodeId) {
    if (isGroup(root)) {
      const { combinator } = patch
      return combinator ? { ...root, combinator } : root
    }
    return { ...root, ...stripUndefined(patch) }
  }

  if (isGroup(root)) {
    let changed = false
    const children = root.children.map((child) => {
      const next = updateNode(child, nodeId, patch)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...root, children } : root
  }

  return root
}

/**
 * 在指定组下追加子节点；parentId 不是组 / 找不到时原样返回。
 */
export function addChild(
  root: DesignerConditionNode,
  parentId: string,
  child: DesignerConditionNode,
): DesignerConditionNode {
  if (root.nodeId === parentId) {
    return isGroup(root) ? { ...root, children: [...root.children, child] } : root
  }

  if (isGroup(root)) {
    let changed = false
    const children = root.children.map((c) => {
      const next = addChild(c, parentId, child)
      if (next !== c) changed = true
      return next
    })
    return changed ? { ...root, children } : root
  }

  return root
}

/**
 * 删除树中节点（连同整个子树）。
 * 根节点不可删（规则必须有 when），删除根时原样返回。
 */
export function removeNode(
  root: DesignerConditionNode,
  nodeId: string,
): DesignerConditionNode {
  if (root.nodeId === nodeId) return root

  if (isGroup(root)) {
    if (root.children.some((c) => c.nodeId === nodeId)) {
      return { ...root, children: root.children.filter((c) => c.nodeId !== nodeId) }
    }
    let changed = false
    const children = root.children.map((c) => {
      const next = removeNode(c, nodeId)
      if (next !== c) changed = true
      return next
    })
    return changed ? { ...root, children } : root
  }

  return root
}

/* ─────────────────────── 动作（then） ─────────────────────── */

/** 新增/更新一个目标字段的动作（patch 浅合并，保留未改开关） */
export function upsertAction(
  then: Record<string, FieldAction>,
  field: string,
  patch: FieldAction,
): Record<string, FieldAction> {
  if (!field) return then
  return {
    ...then,
    [field]: { ...then[field], ...stripUndefined(patch) },
  }
}

/** 删除一个目标字段的动作 */
export function removeAction(
  then: Record<string, FieldAction>,
  field: string,
): Record<string, FieldAction> {
  if (!(field in then)) return then
  const next = { ...then }
  delete next[field]
  return next
}

/* ─────────────────────── 导出剥离 ─────────────────────── */

/**
 * 设计期树 → 核心 ConditionNode（递归剥离 nodeId）。
 * 输出结构与核心 and()/or()/cond() 构造结果逐字段一致，
 * 因此规则 JSON 可被核心 evaluateNode 直接执行。
 */
export function toCoreCondition(node: DesignerConditionNode): CoreConditionNode {
  if (isGroup(node)) {
    const group: ConditionGroup = {
      kind: 'group',
      combinator: node.combinator,
      children: node.children.map(toCoreCondition),
    }
    return group
  }
  const leaf = {
    kind: 'condition' as const,
    field: node.field,
    operator: node.operator,
  }
  // value 按核心语义：notEmpty 无 value；其余保留（含 undefined 则省略键）
  if (node.operator !== 'notEmpty' && node.value !== undefined) {
    return { ...leaf, value: node.value }
  }
  return leaf
}

/* ─────────────────────── 工具 ─────────────────────── */

function stripUndefined<T extends object>(obj: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value
  }
  return result as T
}
