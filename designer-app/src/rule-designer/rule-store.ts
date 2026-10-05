import { computed, reactive } from 'vue'
import type { Rule } from '@runtime-core/types'
import {
  addChild,
  createGroup,
  createLeaf,
  createRuleDoc,
  removeAction as modelRemoveAction,
  removeNode,
  updateNode,
  upsertAction as modelUpsertAction,
  type FieldAction,
  type RuleDoc,
} from './rule-model'
import { buildRules, fromCoreRule } from './rule-builder'

/**
 * Rule Store（规则文档响应式薄封装）
 *
 * 与 designer-store 同构：纯函数承担全部变更逻辑，
 * store 只替换引用 + localStorage 持久化。
 *
 * 导出物（核心 Rule[]）由 computed 实时派生：
 * 改一个操作符、加一个开关，Rule Preview 下一拍即更新。
 */

const STORAGE_KEY = 'low-code-designer/rules/v1'

interface RuleStoreState {
  docs: RuleDoc[]
  selectedRuleId: string | null
}

/** 首次进入给出一条教学规则骨架，避免空白起步 */
function createSeedDocuments(): RuleDoc[] {
  const doc = createRuleDoc('客户类型为公司时：显示并必填公司名称')
  return [doc]
}

function loadDocuments(): RuleDoc[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RuleDoc[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // 数据损坏时回退种子文档
  }
  return createSeedDocuments()
}

const state = reactive<RuleStoreState>({
  docs: loadDocuments(),
  selectedRuleId: null,
})

/* ── 派生 ── */

/** 设计器产出的 Runtime Core Rule[]（实时） */
const currentRules = computed<Rule[]>(() => buildRules(state.docs))

const selectedRule = computed<RuleDoc | null>(
  () => state.docs.find((r) => r.id === state.selectedRuleId) ?? null,
)

/* ── 规则级动作 ── */

function addRule(): void {
  const doc = createRuleDoc(`规则 ${state.docs.length + 1}`)
  state.docs = [...state.docs, doc]
  state.selectedRuleId = doc.id
  persist()
}

function deleteRule(id: string): void {
  state.docs = state.docs.filter((r) => r.id !== id)
  if (state.selectedRuleId === id) state.selectedRuleId = null
  persist()
}

function selectRule(id: string | null): void {
  state.selectedRuleId = id
}

function patchRule(id: string, patch: Partial<Pick<RuleDoc, 'name' | 'priority'>>): void {
  state.docs = state.docs.map((r) => (r.id === id ? { ...r, ...patch } : r))
  persist()
}

/* ── 条件树动作（作用于选中规则） ── */

function patchTreeNode(
  ruleId: string,
  nodeId: string,
  patch: Parameters<typeof updateNode>[2],
): void {
  mutateRuleTree(ruleId, (tree) => updateNode(tree, nodeId, patch))
}

function addCondition(ruleId: string, parentId: string): void {
  mutateRuleTree(ruleId, (tree) => addChild(tree, parentId, createLeaf()))
}

function addGroup(ruleId: string, parentId: string): void {
  mutateRuleTree(ruleId, (tree) =>
    addChild(tree, parentId, createGroup('and', [createLeaf()])),
  )
}

function deleteTreeNode(ruleId: string, nodeId: string): void {
  mutateRuleTree(ruleId, (tree) => removeNode(tree, nodeId))
}

/* ── 动作编辑器动作 ── */

function setAction(ruleId: string, field: string, patch: FieldAction): void {
  const doc = state.docs.find((r) => r.id === ruleId)
  if (!doc) return
  state.docs = state.docs.map((r) =>
    r.id === ruleId ? { ...r, then: modelUpsertAction(r.then, field, patch) } : r,
  )
  persist()
}

function deleteAction(ruleId: string, field: string): void {
  const doc = state.docs.find((r) => r.id === ruleId)
  if (!doc) return
  state.docs = state.docs.map((r) =>
    r.id === ruleId ? { ...r, then: modelRemoveAction(r.then, field) } : r,
  )
  persist()
}

/** 整体替换某个目标字段的动作（用于"不表态"时摘掉某个状态键） */
function replaceAction(ruleId: string, field: string, patch: FieldAction): void {
  const doc = state.docs.find((r) => r.id === ruleId)
  if (!doc || !field) return
  state.docs = state.docs.map((r) => {
    if (r.id !== ruleId) return r
    const nextThen = { ...r.then }
    if (Object.keys(patch).length === 0) delete nextThen[field]
    else nextThen[field] = patch
    return { ...r, then: nextThen }
  })
  persist()
}

/** 更换动作的目标字段（旧字段上的动作整体迁移） */
function renameActionField(ruleId: string, oldField: string, newField: string): void {
  const doc = state.docs.find((r) => r.id === ruleId)
  if (!doc || !newField || newField === oldField) return
  state.docs = state.docs.map((r) => {
    if (r.id !== ruleId) return r
    const patch = r.then[oldField] ?? {}
    const nextThen = { ...r.then, [newField]: patch }
    delete nextThen[oldField]
    return { ...r, then: nextThen }
  })
  persist()
}

/* ── 导入 ── */

/** 导入核心 Rule[]（反向解析为文档继续设计） */
function importRules(rules: Rule[]): void {
  state.docs = rules.map(fromCoreRule)
  state.selectedRuleId = null
  persist()
}

/* ── 内部 ── */

function mutateRuleTree(
  ruleId: string,
  mutate: (tree: RuleDoc['when']) => RuleDoc['when'],
): void {
  const doc = state.docs.find((r) => r.id === ruleId)
  if (!doc) return
  state.docs = state.docs.map((r) =>
    r.id === ruleId ? { ...r, when: mutate(r.when) } : r,
  )
  persist()
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.docs))
  } catch {
    // 存储不可用时设计不中断
  }
}

export function useRuleStore() {
  return {
    state,
    currentRules,
    selectedRule,
    addRule,
    deleteRule,
    selectRule,
    patchRule,
    patchTreeNode,
    addCondition,
    addGroup,
    deleteTreeNode,
    setAction,
    deleteAction,
    replaceAction,
    renameActionField,
    importRules,
  }
}
