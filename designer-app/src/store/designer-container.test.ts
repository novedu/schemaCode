import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { ContainerNode, FieldNode } from '../model/designer-types'
import {
  createContainer,
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

function container(id: string, label = '基本信息', children: (FieldNode | ContainerNode)[] = []): ContainerNode {
  return { id, kind: 'container', label, children }
}

/* ── Test 1：创建 Container ── */

describe('container-model · Test 1 创建容器', () => {
  it('createContainer 产生合法 Schema 节点（kind/label/空 children）', () => {
    const c = createContainer('基本信息')

    assert.equal(c.kind, 'container')
    assert.equal(c.label, '基本信息')
    assert.deepEqual(c.children, [])
    assert.ok(c.id)
  })

  it('insertNode 可把容器放入根层级（不可变）', () => {
    const root: (FieldNode | ContainerNode)[] = [field('a')]
    const c = createContainer()

    const next = insertNode(root, c, null)

    assert.equal(next.length, 2)
    assert.equal(next[1].kind, 'container')
    assert.equal(root.length, 1) // 原数组不变
  })
})

/* ── Test 2：向 Container 添加 Field ── */

describe('container-model · Test 2 容器内添加字段', () => {
  it('insertNode 指定 parentId 后 Field 成为容器 child', () => {
    const c = container('c1')
    const root = [c]
    const f = field('a', 'customerName')

    const next = insertNode(root, f, 'c1') as ContainerNode[]

    assert.equal(next[0].children.length, 1)
    assert.equal(next[0].children[0].id, 'a')
    assert.equal((next[0].children[0] as FieldNode).field, 'customerName')
  })

  it('字段全树唯一性：改名撞容器内已有字段名时自动追加序号', () => {
    // 容器内已有 amount；把 phone 改名为 amount 触发撞名校正
    const next = updateNode(
      [container('c1', '基本信息', [field('a', 'amount'), field('b', 'phone')])],
      'b',
      { field: 'amount' },
    )
    const flat = flattenFields(next)

    assert.deepEqual(flat.map((n) => n.field).sort(), ['amount', 'amount_2'])
  })
})

/* ── Test 3：移动 Field 到 Container ── */

describe('container-model · Test 3 移动字段', () => {
  it('根层级字段移动进容器 B：B.children 含 A，根不再有 A', () => {
    const a = field('a', 'amount')
    const root = [a, container('b', '分组')]

    const result = moveNodeToParent(root, 'a', 'b')
    const next = result.nodes as ContainerNode[]

    assert.equal(result.ok, true)
    assert.equal(next.length, 1)
    assert.equal(next[0].kind, 'container')
    assert.equal(next[0].children.length, 1)
    assert.equal(next[0].children[0].id, 'a')
  })

  it('容器内字段可上移/下移（兄弟序列内交换）', () => {
    const root = [
      container('c', '分组', [field('a'), field('b', 'qty'), field('c2', 'note')]),
    ]

    const next = moveNode(root, 'b', -1) as ContainerNode[]
    assert.deepEqual(
      (next[0].children as FieldNode[]).map((n) => n.id),
      ['b', 'a', 'c2'],
    )
  })
})

/* ── Test 4：删除 Container（children 提升到父级） ── */

describe('container-model · Test 4 删除容器', () => {
  it('删除容器后 children 提升到父级，字段不丢失', () => {
    const root = [
      field('x', 'remark'),
      container('c1', '基本信息', [field('a'), field('b', 'phone')]),
    ]

    const next = removeNode(root, 'c1') as FieldNode[]

    assert.equal(next.length, 3)
    assert.deepEqual(next.map((n) => n.id), ['x', 'a', 'b'])
    assert.equal(next.every((n) => n.kind === 'field'), true)
  })

  it('嵌套容器：删除子容器后其 children 提升到所在容器层级', () => {
    const root = [
      container('outer', '外层', [
        container('inner', '内层', [field('a')]),
        field('b', 'phone'),
      ]),
    ]

    const next = removeNode(root, 'inner') as ContainerNode[]

    assert.equal(next.length, 1)
    assert.deepEqual((next[0].children as FieldNode[]).map((n) => n.id), ['a', 'b'])
  })

  it('删除字段：直接移除，不影响兄弟', () => {
    const root = [container('c1', '基本信息', [field('a'), field('b', 'phone')])]

    const next = removeNode(root, 'a') as ContainerNode[]

    assert.deepEqual((next[0].children as FieldNode[]).map((n) => n.id), ['b'])
  })
})

/* ── Test 5：禁止循环 ── */

describe('container-model · Test 5 循环防护', () => {
  it('容器不能放入自身', () => {
    const root = [container('a', 'A', [field('f', 'x')])]

    const result = moveNodeToParent(root, 'a', 'a')

    assert.equal(result.ok, false)
    assert.equal(result.reason, '不能把容器放入自身')
    assert.equal(result.nodes, root) // 原树不变
  })

  it('容器不能放入自己的后代（A 含 B 时，A 不能移入 B）', () => {
    const b = container('b', 'B', [field('f', 'x')])
    const root = [container('a', 'A', [b])]

    const result = moveNodeToParent(root, 'a', 'b')

    assert.equal(result.ok, false)
    assert.equal(result.reason, '不能把容器移入自己的后代')
    // 结构保持：A 仍是 B 的父级
    const tree = result.nodes as ContainerNode[]
    assert.equal((tree[0].children[0] as ContainerNode).id, 'b')
  })

  it('合法嵌套：独立容器 B 可以移入 A（非后代）', () => {
    const root = [container('a', 'A', [field('f', 'x')]), container('b', 'B')]

    const result = moveNodeToParent(root, 'b', 'a')
    const next = result.nodes as ContainerNode[]

    assert.equal(result.ok, true)
    assert.equal(next.length, 1)
    assert.equal((next[0].children[1] as ContainerNode).id, 'b')
  })

  it('目标不是容器时拒绝（Field 永远是叶子）', () => {
    const root = [field('a'), field('b', 'qty')]

    const result = moveNodeToParent(root, 'b', 'a')

    assert.equal(result.ok, false)
    assert.equal(result.reason, '目标必须是容器或栅格列')
  })
})

/* ── 查询辅助 ── */

describe('container-model · 查询', () => {
  it('findNode 深度查找；flattenFields 展平全树字段', () => {
    const root = [
      field('a', 'remark'),
      container('c1', '基本信息', [
        field('b', 'name'),
        container('c2', '联系', [field('c', 'phone')]),
      ]),
    ]

    assert.equal(findNode(root, 'c')?.id, 'c')
    assert.equal(findNode(root, 'nope'), null)
    assert.deepEqual(flattenFields(root).map((n) => n.id), ['a', 'b', 'c'])
  })
})
