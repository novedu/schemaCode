/**
 * Schema Tree View Model（视图适配器）
 *
 * 唯一职责：把 CanvasNode 业务模型转换为 el-tree 所需的视图模型。
 * 只做展示投影，不维护独立状态，不修改业务数据。
 */
import type { CanvasNode, ColumnNode } from '../model/designer-types'

/** Schema Tree 展示节点（View Model，仅适配 el-tree） */
export interface SchemaTreeNode {
  id: string
  kind: 'field' | 'container' | 'grid' | 'column'
  displayLabel: string
  /** el-tree 需要 children 字段作为子节点入口；无子节点时省略（叶子） */
  children?: SchemaTreeNode[]
  /** 是否可以被选中 */
  selectable: boolean
}

/** CanvasNode → SchemaTreeNode（递归转换） */
export function toTreeData(nodes: CanvasNode[]): SchemaTreeNode[] {
  return nodes.map((node) => nodeToTreeNode(node))
}

function nodeToTreeNode(node: CanvasNode): SchemaTreeNode {
  if (node.kind === 'field') {
    return {
      id: node.id,
      kind: 'field',
      displayLabel: node.label || node.field || '未命名字段',
      selectable: true,
    }
  }

  if (node.kind === 'container') {
    return {
      id: node.id,
      kind: 'container',
      displayLabel: node.label || '未命名容器',
      children: toTreeData(node.children),
      selectable: true,
    }
  }

  // grid
  return {
    id: node.id,
    kind: 'grid',
    displayLabel: node.label || '未命名栅格',
    children: node.columns.map((col, idx) => columnToTreeNode(col, idx)),
    selectable: true,
  }
}

function columnToTreeNode(col: ColumnNode, index: number): SchemaTreeNode {
  return {
    id: col.id,
    kind: 'column',
    displayLabel: `Column ${index + 1}（${col.children.length} 项）`,
    children: toTreeData(col.children as CanvasNode[]),
    selectable: false,
  }
}

/**
 * 在已生成的 TreeNode 列表中查找 selectable=true 的节点 id 列表
 * 用于 el-tree default-expanded-keys（自动展开当前选中路径）。
 */
export function extractSelectableIds(nodes: SchemaTreeNode[]): string[] {
  const result: string[] = []
  for (const node of nodes) {
    if (node.selectable) result.push(node.id)
    if (node.children) result.push(...extractSelectableIds(node.children))
  }
  return result
}
