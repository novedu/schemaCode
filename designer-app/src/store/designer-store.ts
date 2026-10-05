import { computed, reactive } from 'vue'
import type {
  CanvasNode,
  ComponentTemplate,
  DesignerDocument,
  FieldNode,
} from '../model/designer-types'
import {
  createContainer,
  createGrid,
  createNodeFromTemplate,
  findNode,
  flattenFields,
  insertNode,
  moveNode,
  moveNodeToParent,
  removeNode,
  updateNode,
  type MoveResult,
} from './designer-model'
import { buildSchema, schemaToNodes } from '../schema/schema-builder'
import type { Schema } from '@runtime-core/types'

/**
 * Designer Store（响应式薄封装）
 *
 * 设计器单一数据源：文档（节点树）+ 当前选中节点。
 * 变更全部委托给纯函数 designer-model，store 只替换引用，
 * 并负责 localStorage 持久化与文件导出。
 *
 * 产物（核心 Schema）由 computed 实时派生 ——
 * 属性面板改 precision 的下一拍，Schema JSON、Canvas、Preview 全部更新。
 */

const STORAGE_KEY = 'low-code-designer/document/v1'

interface DesignerState {
  doc: DesignerDocument
  selectedId: string | null
}

function createEmptyDocument(): DesignerDocument {
  return {
    id: `doc_${Date.now().toString(36)}`,
    formId: 'customForm',
    title: '未命名表单',
    nodes: [],
  }
}

/** 从 localStorage 恢复；失败则给空文档（不阻断设计） */
function loadDocument(): DesignerDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DesignerDocument
      if (Array.isArray(parsed.nodes)) return parsed
    }
  } catch {
    // 数据损坏时静默回退到空文档
  }
  return createEmptyDocument()
}

const state = reactive<DesignerState>({
  doc: loadDocument(),
  selectedId: null,
})

/* ── 派生 ── */

/** 当前节点树翻译出的 Runtime Core Schema（实时，含可选 layout） */
const currentSchema = computed<Schema>(() => buildSchema(state.doc.nodes))

const selectedNode = computed<CanvasNode | null>(() =>
  state.selectedId ? findNode(state.doc.nodes, state.selectedId) : null,
)

/** 全树字段数（容器不计入） */
const fieldCount = computed(() => flattenFields(state.doc.nodes).length)

/* ── 动作 ── */

/**
 * 点击物料添加字段：
 *   - 显式传 parentId（拖拽场景）：null=根层级，string=目标容器；
 *   - 未传（点击场景）：选中的是容器 → 该容器末尾，否则根末尾。
 */
function addFromTemplate(template: ComponentTemplate, parentId?: string | null): void {
  const node = createNodeFromTemplate(template, state.doc.nodes)
  const target = parentId !== undefined
    ? parentId
    : selectedNode.value?.kind === 'container'
      ? selectedNode.value.id
      : null
  state.doc.nodes = insertNode(state.doc.nodes, node, target)
  state.selectedId = node.id
  persist()
}

/** 添加容器：null=根层级（默认），string=嵌入指定容器（容器嵌套） */
function addContainer(parentId?: string | null): void {
  const container = createContainer()
  state.doc.nodes = insertNode(state.doc.nodes, container, parentId ?? null)
  state.selectedId = container.id
  persist()
}

/** 添加栅格：2 列或 3 列，列数创建时固定，追加到根层级 */
function addGrid(columnCount: 2 | 3): void {
  const grid = createGrid(columnCount)
  state.doc.nodes = insertNode(state.doc.nodes, grid, null)
  state.selectedId = grid.id
  persist()
}

/** 字段属性 patch 或容器标题 patch */
type SelectedPatch = Partial<Omit<FieldNode, 'id' | 'kind'>> | { label: string }

function patchSelected(patch: SelectedPatch): void {
  if (!state.selectedId) return
  state.doc.nodes = updateNode(state.doc.nodes, state.selectedId, patch)
  persist()
}

function selectNode(id: string | null): void {
  state.selectedId = id
}

/** 删除选中节点：字段直接删；容器 children 提升到父级（不丢字段） */
function deleteSelected(): void {
  if (!state.selectedId) return
  state.doc.nodes = removeNode(state.doc.nodes, state.selectedId)
  state.selectedId = null
  persist()
}

function moveSelected(delta: -1 | 1): void {
  if (!state.selectedId) return
  state.doc.nodes = moveNode(state.doc.nodes, state.selectedId, delta)
  persist()
}

/**
 * 拖拽移动：把 dragId 移入 targetParentId（null=根层级）的 index 处。
 * 循环/非法目标由模型层拒绝，返回原因供 UI 提示。
 */
function moveNodeInTree(
  dragId: string,
  targetParentId: string | null,
  index?: number,
): MoveResult {
  const result = moveNodeToParent(state.doc.nodes, dragId, targetParentId, index)
  if (result.ok) {
    state.doc.nodes = result.nodes
    persist()
  }
  return result
}

function clearCanvas(): void {
  state.doc.nodes = []
  state.selectedId = null
  persist()
}

/** 导入 Runtime Schema（反向解析为节点树后继续设计） */
function importSchema(schema: Schema): void {
  state.doc.nodes = schemaToNodes(schema)
  state.selectedId = null
  persist()
}

function setTitle(title: string): void {
  state.doc.title = title
  persist()
}

/** 设置表单标识（发布到配置中心的 formId） */
function setFormId(formId: string): void {
  state.doc.formId = formId
  persist()
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.doc))
  } catch {
    // 存储已满/被禁用时设计不中断
  }
}

export function useDesignerStore() {
  return {
    state,
    currentSchema,
    selectedNode,
    fieldCount,
    addFromTemplate,
    addContainer,
    addGrid,
    patchSelected,
    selectNode,
    deleteSelected,
    moveSelected,
    moveNodeInTree,
    clearCanvas,
    importSchema,
    setTitle,
    setFormId,
  }
}
