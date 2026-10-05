import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { CanvasNode, FieldNode, GridNode } from '../model/designer-types'
import {
  createGrid,
  findNode,
  flattenFields,
  insertNode,
  moveNode,
  moveNodeToParent,
  removeNode,
  updateNode,
} from './designer-model'

/* 夹具 */
function field(id: string, fieldName = 'amount'): FieldNode {
  return {
    id,
    kind: 'field',
    field: fieldName,
    label: fieldName,
    component: 'MoneyInput',
    props: {},
    required: false,
  }
}

function grid(id: string, label = '栅格', columns: { id: string; children: FieldNode[] }[]): GridNode {
  return {
    id,
    kind: 'grid',
    label,
    columns: columns.map((col) => ({
      id: col.id,
      kind: 'column',
      children: col.children,
    })),
  }
}

/* ── Test 1：创建 Grid ── */

describe('grid-model · Test 1 创建栅格', () => {
  it('createGrid(2) 产生 2 列空栅格', () => {
    const g = createGrid(2, '两列栅格')

    assert.equal(g.kind, 'grid')
    assert.equal(g.label, '两列栅格')
    assert.equal(g.columns.length, 2)
    assert.ok(g.id)
    for (const col of g.columns) {
      assert.equal(col.kind, 'column')
      assert.deepEqual(col.children, [])
      assert.ok(col.id)
    }
  })

  it('createGrid(3) 产生 3 列空栅格', () => {
    const g = createGrid(3, '三列栅格')

    assert.equal(g.kind, 'grid')
    assert.equal(g.label, '三列栅格')
    assert.equal(g.columns.length, 3)
  })

  it('insertNode 可把栅格放入根层级（不可变）', () => {
    const root: CanvasNode[] = [field('a')]
    const g = createGrid(2)

    const next = insertNode(root, g, null)

    assert.equal(next.length, 2)
    assert.equal(next[1].kind, 'grid')
    assert.equal(root.length, 1) // 原数组不变
  })
})

/* ── Test 2：向 Grid 的 Column 添加 Field ── */

describe('grid-model · Test 2 列内添加字段', () => {
  it('insertNode 指定 columnId 后 Field 进入该列', () => {
    const g = grid('g1', '两列栅格', [
      { id: 'col1', children: [] },
      { id: 'col2', children: [] },
    ])
    const root: CanvasNode[] = [g]
    const f = field('f1', 'customerName')

    const next = insertNode(root, f, 'col1') as GridNode[]

    assert.equal(next[0].columns[0].children.length, 1)
    assert.equal(next[0].columns[0].children[0].id, 'f1')
    assert.equal(next[0].columns[1].children.length, 0)
  })

  it('字段全树唯一性：撞名时自动追加序号', () => {
    const g = grid('g1', '两列栅格', [
      { id: 'col1', children: [field('a', 'amount')] },
      { id: 'col2', children: [field('b', 'phone')] },
    ])
    const root: CanvasNode[] = [g]

    const next = updateNode(root, 'b', { field: 'amount' })
    const flat = flattenFields(next)

    assert.deepEqual(flat.map((n) => n.field).sort(), ['amount', 'amount_2'])
  })
})

/* ── Test 3：移动 Field 到 Column ── */

describe('grid-model · Test 3 移动字段到列', () => {
  it('根层级字段移动进 Column：Column 含该字段，根不再有', () => {
    const g = grid('g1', '两列栅格', [
      { id: 'col1', children: [] },
      { id: 'col2', children: [] },
    ])
    const a = field('a', 'amount')
    const root: CanvasNode[] = [a, g]

    const result = moveNodeToParent(root, 'a', 'col1')
    const next = result.nodes as GridNode[]

    assert.equal(result.ok, true)
    assert.equal(next.length, 1)
    assert.equal(next[0].columns[0].children.length, 1)
    assert.equal(next[0].columns[0].children[0].id, 'a')
  })

  it('列内字段可上移/下移（兄弟序列内交换）', () => {
    const root: CanvasNode[] = [
      grid('g1', '两列栅格', [
        { id: 'col1', children: [field('a'), field('b', 'qty'), field('c', 'note')] },
        { id: 'col2', children: [] },
      ]),
    ]

    const next = moveNode(root, 'b', -1) as GridNode[]
    assert.deepEqual(
      next[0].columns[0].children.map((n) => n.id),
      ['b', 'a', 'c'],
    )
  })

  it('字段可在 Grid 的两列之间移动', () => {
    const root: CanvasNode[] = [
      grid('g1', '两列栅格', [
        { id: 'col1', children: [field('a', 'amount')] },
        { id: 'col2', children: [field('b', 'phone')] },
      ]),
    ]

    const result = moveNodeToParent(root, 'a', 'col2')
    const next = result.nodes as GridNode[]

    assert.equal(result.ok, true)
    assert.equal(next[0].columns[0].children.length, 0)
    assert.equal(next[0].columns[1].children.length, 2)
    assert.equal(next[0].columns[1].children[1].id, 'a')
  })
})

/* ── Test 4：删除 Grid（各列字段按列序+列内序提升到父级） ── */

describe('grid-model · Test 4 删除栅格', () => {
  it('删除栅格后各列字段按列序+列内序提升到父级', () => {
    const root: CanvasNode[] = [
      field('x', 'remark'),
      grid('g1', '两列栅格', [
        { id: 'col1', children: [field('a', 'amount'), field('b', 'phone')] },
        { id: 'col2', children: [field('c', 'note')] },
      ]),
    ]

    const next = removeNode(root, 'g1') as FieldNode[]

    assert.equal(next.length, 4)
    assert.deepEqual(next.map((n) => n.id), ['x', 'a', 'b', 'c'])
    assert.equal(next.every((n) => n.kind === 'field'), true)
  })

  it('删除列内字段：直接移除，不影响兄弟', () => {
    const root: CanvasNode[] = [
      grid('g1', '两列栅格', [
        { id: 'col1', children: [field('a'), field('b', 'phone')] },
        { id: 'col2', children: [field('c', 'note')] },
      ]),
    ]

    const next = removeNode(root, 'a') as GridNode[]

    assert.deepEqual(next[0].columns[0].children.map((n) => n.id), ['b'])
    assert.deepEqual(next[0].columns[1].children.map((n) => n.id), ['c'])
  })
})

/* ── Test 5：循环防护与非法移动 ── */

describe('grid-model · Test 5 循环防护与非法移动', () => {
  it('Grid 不能放入 Grid', () => {
    const g1 = grid('g1', '栅格A', [
      { id: 'c1', children: [] },
      { id: 'c2', children: [] },
    ])
    const g2 = grid('g2', '栅格B', [
      { id: 'c3', children: [] },
      { id: 'c4', children: [] },
    ])
    const root: CanvasNode[] = [g1, g2]

    const result = moveNodeToParent(root, 'g2', 'g1')

    assert.equal(result.ok, false)
    assert.equal(result.reason, '栅格不能放入栅格或列')
  })

  it('Grid 不能放入 Column', () => {
    const g = grid('g1', '栅格', [
      { id: 'col1', children: [] },
      { id: 'col2', children: [] },
    ])
    const root: CanvasNode[] = [g]

    const result = moveNodeToParent(root, 'g1', 'col1')

    assert.equal(result.ok, false)
    assert.equal(result.reason, '栅格不能放入栅格或列')
  })

  it('Grid 不能放入自己的后代列', () => {
    const g = grid('g1', '栅格', [
      { id: 'col1', children: [field('f', 'x')] },
      { id: 'col2', children: [] },
    ])
    const root: CanvasNode[] = [g]

    const result = moveNodeToParent(root, 'g1', 'col2')

    assert.equal(result.ok, false)
    assert.equal(result.reason, '栅格不能放入栅格或列')
  })

  it('目标不是容器或列时拒绝', () => {
    const root: CanvasNode[] = [field('a'), field('b', 'qty')]

    const result = moveNodeToParent(root, 'b', 'a')

    assert.equal(result.ok, false)
    assert.equal(result.reason, '目标必须是容器或栅格列')
  })
})

/* ── Test 6：查询与展平 ── */

describe('grid-model · Test 6 查询与展平', () => {
  it('findNode 可找到 Grid 和 Column 内字段', () => {
    const root: CanvasNode[] = [
      grid('g1', '栅格', [
        { id: 'col1', children: [field('a', 'amount')] },
        { id: 'col2', children: [field('b', 'phone')] },
      ]),
    ]

    assert.equal(findNode(root, 'g1')?.kind, 'grid')
    assert.equal(findNode(root, 'col1')?.kind, 'column')
    assert.equal(findNode(root, 'a')?.kind, 'field')
    assert.equal(findNode(root, 'nope'), null)
  })

  it('flattenFields 展平 Grid 内全部字段（列序+列内序）', () => {
    const root: CanvasNode[] = [
      field('x', 'remark'),
      grid('g1', '栅格', [
        { id: 'col1', children: [field('a', 'amount'), field('b', 'phone')] },
        { id: 'col2', children: [field('c', 'note')] },
      ]),
    ]

    assert.deepEqual(flattenFields(root).map((n) => n.id), ['x', 'a', 'b', 'c'])
  })
})
