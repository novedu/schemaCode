import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { CanvasNode, ContainerNode, FieldNode, GridNode } from '../model/designer-types'
import { createGrid } from '../store/designer-model'
import { toTreeData, extractSelectableIds } from './schema-tree-model'

/* 夹具 */
function field(id: string, fieldName = 'amount', label?: string): FieldNode {
  return {
    id,
    kind: 'field',
    field: fieldName,
    label: label ?? fieldName,
    component: 'MoneyInput',
    props: {},
    required: false,
  }
}

function container(id: string, label = '基本信息', children: CanvasNode[] = []): ContainerNode {
  return { id, kind: 'container', label, children }
}

function grid(id: string, label = '栅格', columnCount: 2 | 3 = 2): GridNode {
  const grid = createGrid(columnCount, label)
  return { ...grid, id }
}

/* ── Case 1：Field ── */

describe('schema-tree-model · Case 1 Field', () => {
  it('Field 转换为叶子 TreeNode', () => {
    const nodes: CanvasNode[] = [field('f1', 'customerName', '客户名称')]
    const tree = toTreeData(nodes)

    assert.equal(tree.length, 1)
    assert.equal(tree[0].id, 'f1')
    assert.equal(tree[0].kind, 'field')
    assert.equal(tree[0].displayLabel, '客户名称')
    assert.equal(tree[0].selectable, true)
    assert.equal(tree[0].children, undefined)
  })

  it('Field 无 label 时 fallback 到 field', () => {
    const nodes: CanvasNode[] = [field('f1', 'customerName', '')]
    const tree = toTreeData(nodes)
    assert.equal(tree[0].displayLabel, 'customerName')
  })
})

/* ── Case 2：Container ── */

describe('schema-tree-model · Case 2 Container', () => {
  it('Container 含 children 递归转换', () => {
    const nodes: CanvasNode[] = [
      container('c1', '基本信息', [field('f1', 'customerName', '客户名称')]),
    ]
    const tree = toTreeData(nodes)

    assert.equal(tree.length, 1)
    assert.equal(tree[0].id, 'c1')
    assert.equal(tree[0].kind, 'container')
    assert.equal(tree[0].displayLabel, '基本信息')
    assert.equal(tree[0].selectable, true)
    assert.equal(tree[0].children?.length, 1)
    assert.equal(tree[0].children?.[0].id, 'f1')
  })
})

/* ── Case 3：Grid（不能展平 Column） ── */

describe('schema-tree-model · Case 3 Grid', () => {
  it('Grid → Column → Field 层级正确', () => {
    const g = grid('g1', '产品信息', 2)
    // 手动填充 Column children
    g.columns[0].children = [field('f1', 'amount', '金额'), field('f2', 'qty', '数量')]
    g.columns[1].children = [field('f3', 'price', '单价')]

    const nodes: CanvasNode[] = [g]
    const tree = toTreeData(nodes)

    assert.equal(tree.length, 1)
    assert.equal(tree[0].id, 'g1')
    assert.equal(tree[0].kind, 'grid')
    assert.equal(tree[0].displayLabel, '产品信息')
    assert.equal(tree[0].selectable, true)
    assert.equal(tree[0].children?.length, 2)

    // Column 1
    const col1 = tree[0].children?.[0]
    assert.equal(col1?.kind, 'column')
    assert.equal(col1?.selectable, false)
    assert.equal(col1?.displayLabel, 'Column 1（2 项）')
    assert.equal(col1?.children?.length, 2)
    assert.equal(col1?.children?.[0].id, 'f1')
    assert.equal(col1?.children?.[1].id, 'f2')

    // Column 2
    const col2 = tree[0].children?.[1]
    assert.equal(col2?.kind, 'column')
    assert.equal(col2?.selectable, false)
    assert.equal(col2?.displayLabel, 'Column 2（1 项）')
    assert.equal(col2?.children?.length, 1)
    assert.equal(col2?.children?.[0].id, 'f3')
  })

  it('Grid 空 Column 也正确显示', () => {
    const g = grid('g1', '产品信息', 3)
    g.columns[0].children = [field('f1', 'amount', '金额')]
    // Column 2/3 为空

    const tree = toTreeData([g])
    assert.equal(tree[0].children?.length, 3)
    assert.equal(tree[0].children?.[0].children?.length, 1)
    assert.equal(tree[0].children?.[1].children?.length, 0)
    assert.equal(tree[0].children?.[2].children?.length, 0)
  })
})

/* ── Case 4：Column 不可选择 ── */

describe('schema-tree-model · Case 4 Column 不可选择', () => {
  it('Column selectable === false', () => {
    const g = grid('g1', '栅格', 2)
    g.columns[0].children = [field('f1', 'amount', '金额')]
    const tree = toTreeData([g])

    const col1 = tree[0].children?.[0]
    assert.equal(col1?.selectable, false)
  })
})

/* ── Case 5：混合结构 ── */

describe('schema-tree-model · Case 5 混合结构', () => {
  it('Container + Grid + Field 混合', () => {
    const g = grid('g1', '产品信息', 2)
    g.columns[0].children = [field('f2', 'amount', '金额')]
    g.columns[1].children = [field('f3', 'qty', '数量')]

    const nodes: CanvasNode[] = [
      field('f1', 'customerName', '客户名称'),
      container('c1', '基本信息', [field('f4', 'phone', '电话')]),
      g,
    ]

    const tree = toTreeData(nodes)

    assert.equal(tree.length, 3)
    assert.equal(tree[0].kind, 'field')
    assert.equal(tree[1].kind, 'container')
    assert.equal(tree[1].children?.length, 1)
    assert.equal(tree[2].kind, 'grid')
    assert.equal(tree[2].children?.length, 2)
    assert.equal(tree[2].children?.[0].children?.length, 1)
  })
})

/* ── Case 6：extractSelectableIds ── */

describe('schema-tree-model · Case 6 extractSelectableIds', () => {
  it('提取所有 selectable 节点 id', () => {
    const g = grid('g1', '栅格', 2)
    g.columns[0].children = [field('f1', 'amount', '金额')]
    g.columns[1].children = [field('f2', 'qty', '数量')]

    const tree = toTreeData([container('c1', '基本信息', [field('f3', 'name', '姓名')]), g])
    const ids = extractSelectableIds(tree)

    assert.ok(ids.includes('c1'))
    assert.ok(ids.includes('f3'))
    assert.ok(ids.includes('g1'))
    assert.ok(ids.includes('f1'))
    assert.ok(ids.includes('f2'))
    // Column 不可选，不在列表中
    assert.ok(!ids.includes(g.columns[0].id))
    assert.ok(!ids.includes(g.columns[1].id))
  })
})
