/**
 * Designer Model（纯函数操作集）
 *
 * 节点结构（Grid 阶段起）：
 *   Canvas = (Field | Container | Grid)*
 *   Container ── children ──▶ Field | Container | Grid
 *   Grid ── columns ──▶ Column ── children ──▶ Field
 *   Field 永远是叶子
 *   Column 是 Grid 内部槽位，不作为独立节点移动/删除
 */
import type { CanvasNode, ComponentTemplate, ContainerNode, FieldNode, GridNode, ColumnNode } from '../model/designer-types'

let seq = 0
export function createNodeId(): string {
  seq += 1
  return `node_${Date.now().toString(36)}_${seq}`
}

export function createContainer(label = '分组容器'): ContainerNode {
  return { id: createNodeId(), kind: 'container', label, children: [] }
}

export function createGrid(columnCount: 2 | 3, label = '栅格'): GridNode {
  const columns: ColumnNode[] = Array.from({ length: columnCount }, () => ({
    id: createNodeId(), kind: 'column', children: [],
  }))
  return { id: createNodeId(), kind: 'grid', label, columns }
}

export function createNodeFromTemplate(template: ComponentTemplate, existing: CanvasNode[]): FieldNode {
  const field = uniqueFieldName(template.defaultField, existing)
  return {
    id: createNodeId(), kind: 'field', field,
    label: template.defaultLabel, component: template.component,
    props: { ...template.defaultProps }, required: false,
    ...(template.hasOptions
      ? { options: template.defaultOptions?.map((o) => ({ ...o })) ?? [] }
      : {}),
  }
}

/* ── 查询 ── */

export function findNode(nodes: CanvasNode[], id: string): CanvasNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.kind === 'container') {
      const hit = findNode(node.children, id)
      if (hit) return hit
    }
    if (node.kind === 'grid') {
      for (const col of node.columns) {
        if (col.id === id) return col as unknown as CanvasNode
        const hit = findNode(col.children as CanvasNode[], id)
        if (hit) return hit
      }
    }
  }
  return null
}

export function flattenFields(nodes: CanvasNode[]): FieldNode[] {
  const result: FieldNode[] = []
  for (const node of nodes) {
    if (node.kind === 'field') result.push(node)
    else if (node.kind === 'container') result.push(...flattenFields(node.children))
    else if (node.kind === 'grid') {
      for (const col of node.columns) {
        result.push(...flattenFields(col.children as CanvasNode[]))
      }
    }
  }
  return result
}

export function isDescendant(nodes: CanvasNode[], ancestorId: string, maybeDescendantId: string): boolean {
  const ancestor = findNode(nodes, ancestorId)
  if (!ancestor) return ancestorId === maybeDescendantId
  if (ancestor.kind === 'container') {
    return findNode(ancestor.children, maybeDescendantId) !== null
  }
  if (ancestor.kind === 'grid') {
    for (const col of ancestor.columns) {
      if (findNode(col.children as CanvasNode[], maybeDescendantId) !== null) return true
    }
  }
  return ancestorId === maybeDescendantId
}

/* ── 增删改 ── */

export function insertNode(nodes: CanvasNode[], node: CanvasNode, parentId: string | null, index?: number): CanvasNode[] {
  if (parentId === null) return addNode(nodes, node, index)
  return nodes.map((current) => {
    if (current.id !== parentId) {
      if (current.kind === 'container') {
        return { ...current, children: insertNode(current.children, node, parentId, index) }
      }
      if (current.kind === 'grid') {
        return {
          ...current,
          columns: current.columns.map((col) => {
            if (col.id === parentId && node.kind === 'field') {
              const children = [...col.children]
              children.splice(index ?? children.length, 0, node)
              return { ...col, children }
            }
            return {
              ...col,
              children: insertNode(col.children as CanvasNode[], node, parentId, index) as FieldNode[],
            }
          }),
        }
      }
      return current
    }
    if (current.kind === 'container') {
      return { ...current, children: addNode(current.children, node, index) }
    }
    return current
  })
}

export function addNode(nodes: CanvasNode[], node: CanvasNode, index?: number): CanvasNode[] {
  const next = [...nodes]
  next.splice(index ?? next.length, 0, node)
  return next
}

export function updateNode(
  nodes: CanvasNode[], id: string,
  patch: Partial<Omit<FieldNode, 'id' | 'kind'>> | Partial<Omit<ContainerNode, 'id' | 'kind' | 'children'>>,
  allNodes?: CanvasNode[],
): CanvasNode[] {
  const all = allNodes ?? nodes
  return nodes.map((node) => {
    if (node.id === id) {
      if (node.kind === 'container' || node.kind === 'grid') {
        const label = (patch as Partial<ContainerNode>).label
        return label === undefined ? node : { ...node, label }
      }
      const fieldPatch = patch as Partial<FieldNode>
      const merged: FieldNode = { ...node, ...fieldPatch, props: { ...node.props, ...(fieldPatch.props ?? {}) } }
      if (fieldPatch.field && fieldPatch.field !== node.field) {
        merged.field = uniqueFieldName(fieldPatch.field, flattenFields(all).filter((n) => n.id !== id))
      }
      return merged
    }
    if (node.kind === 'container') return { ...node, children: updateNode(node.children, id, patch, all) }
    if (node.kind === 'grid') {
      return {
        ...node,
        columns: node.columns.map((col) => ({
          ...col,
          children: updateNode(col.children as CanvasNode[], id, patch, all) as FieldNode[],
        })),
      }
    }
    return node
  })
}

export function removeNode(nodes: CanvasNode[], id: string): CanvasNode[] {
  const result: CanvasNode[] = []
  for (const node of nodes) {
    if (node.id === id) {
      if (node.kind === 'container') result.push(...node.children)
      if (node.kind === 'grid') {
        for (const col of node.columns) result.push(...col.children)
      }
      continue
    }
    if (node.kind === 'container') {
      result.push({ ...node, children: removeNode(node.children, id) })
    } else if (node.kind === 'grid') {
      result.push({
        ...node,
        columns: node.columns.map((col) => ({
          ...col,
          children: removeNode(col.children as CanvasNode[], id) as FieldNode[],
        })),
      })
    } else {
      result.push(node)
    }
  }
  return result
}

/* ── 移动 ── */

export function moveNode(nodes: CanvasNode[], id: string, delta: -1 | 1): CanvasNode[] {
  if (findNode(nodes, id) === null) return nodes
  const index = nodes.findIndex((n) => n.id === id)
  if (index !== -1) {
    const target = index + delta
    if (target < 0 || target >= nodes.length) return nodes
    const next = [...nodes]
    const [node] = next.splice(index, 1)
    next.splice(target, 0, node)
    return next
  }
  return nodes.map((node) => {
    if (node.kind === 'container') return { ...node, children: moveNode(node.children, id, delta) }
    if (node.kind === 'grid') {
      return {
        ...node,
        columns: node.columns.map((col) => ({
          ...col,
          children: moveNode(col.children as CanvasNode[], id, delta) as FieldNode[],
        })),
      }
    }
    return node
  })
}

export interface MoveResult { ok: boolean; nodes: CanvasNode[]; reason?: string }

export function moveNodeToParent(
  nodes: CanvasNode[], dragId: string, targetParentId: string | null, index?: number,
): MoveResult {
  const dragging = findNode(nodes, dragId)
  if (!dragging) return { ok: false, nodes, reason: '节点不存在' }

  if (targetParentId === null) {
    return { ok: true, nodes: removeFromTree(nodes, dragId, index) }
  }

  if (dragId === targetParentId) {
    return { ok: false, nodes, reason: '不能把容器放入自身' }
  }

  const target = findNode(nodes, targetParentId)

  // 目标必须是容器或栅格列
  const targetKind = (target as any)?.kind as string | undefined
  if (!target || (targetKind !== 'container' && targetKind !== 'grid' && targetKind !== 'column')) {
    return { ok: false, nodes, reason: '目标必须是容器或栅格列' }
  }

  // Grid 不能移入 Grid/Column
  if (dragging.kind === 'grid') {
    if (targetKind === 'grid' || targetKind === 'column') {
      return { ok: false, nodes, reason: '栅格不能放入栅格或列' }
    }
  }

  // 不能移入自己的后代
  if (isDescendant(nodes, dragId, targetParentId)) {
    return { ok: false, nodes, reason: '不能把容器移入自己的后代' }
  }

  return { ok: true, nodes: removeFromTree(nodes, dragId, index, targetParentId) }
}

function removeFromTree(nodes: CanvasNode[], dragId: string, index?: number, targetParentId?: string): CanvasNode[] {
  const removed = detach(nodes, dragId)
  if (!removed) return nodes
  const { tree, node } = removed
  if (targetParentId === undefined) return insertNodeKeepId(tree, node, index)
  return insertNode(tree, node, targetParentId, index)
}

function detach(nodes: CanvasNode[], id: string): { tree: CanvasNode[]; node: CanvasNode } | null {
  const hit = nodes.find((node) => node.id === id)
  if (hit) return { tree: nodes.filter((node) => node.id !== id), node: hit }
  for (const node of nodes) {
    if (node.kind === 'container') {
      const result = detach(node.children, id)
      if (result) {
        return {
          tree: nodes.map((n) => n.kind === 'container' && n.id === node.id ? { ...n, children: result.tree } : n),
          node: result.node,
        }
      }
    }
    if (node.kind === 'grid') {
      for (let i = 0; i < node.columns.length; i++) {
        const result = detach(node.columns[i].children as CanvasNode[], id)
        if (result) {
          return {
            tree: nodes.map((n) =>
              n.kind === 'grid' && n.id === node.id
                ? { ...n, columns: n.columns.map((col, ci) => ci === i ? { ...col, children: result.tree as FieldNode[] } : col) }
                : n,
            ),
            node: result.node,
          }
        }
      }
    }
  }
  return null
}

function insertNodeKeepId(nodes: CanvasNode[], node: CanvasNode, index?: number): CanvasNode[] {
  return addNode(nodes, node, index)
}

export function uniqueFieldName(base: string, existing: CanvasNode[]): string {
  const used = new Set(flattenFields(existing).map((n) => n.field))
  if (!used.has(base)) return base
  let candidate = `${base}_2`
  let i = 2
  while (used.has(candidate)) { i += 1; candidate = `${base}_${i}` }
  return candidate
}
