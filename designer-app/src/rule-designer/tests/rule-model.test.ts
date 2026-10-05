import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  addChild,
  createGroup,
  createLeaf,
  removeAction,
  removeNode,
  toCoreCondition,
  updateNode,
  upsertAction,
} from '../rule-model'

describe('rule-model · 简单 condition 生成', () => {
  it('叶子 → 核心条件结构（无编辑用 nodeId 残留）', () => {
    const leaf = createLeaf('customerType', 'equals', 'company')
    const core = toCoreCondition(leaf)

    assert.deepEqual(core, {
      kind: 'condition',
      field: 'customerType',
      operator: 'equals',
      value: 'company',
    })
  })

  it('notEmpty 不输出 value 键（核心 notEmpty 无期望值）', () => {
    const core = toCoreCondition(createLeaf('companyName', 'notEmpty'))
    assert.deepEqual(core, {
      kind: 'condition',
      field: 'companyName',
      operator: 'notEmpty',
    })
  })
})

describe('rule-model · AND / OR 嵌套生成', () => {
  it('customerType=company AND registeredCapital>1000', () => {
    const tree = createGroup('and', [
      createLeaf('customerType', 'equals', 'company'),
      createLeaf('registeredCapital', 'greaterThan', 1000),
    ])

    const core = toCoreCondition(tree)

    assert.deepEqual(core, {
      kind: 'group',
      combinator: 'and',
      children: [
        { kind: 'condition', field: 'customerType', operator: 'equals', value: 'company' },
        { kind: 'condition', field: 'registeredCapital', operator: 'greaterThan', value: 1000 },
      ],
    })
  })

  it('混合逻辑通过嵌套子组表达：A AND (B OR C)', () => {
    const tree = createGroup('and', [
      createLeaf('A', 'equals', 1),
      createGroup('or', [
        createLeaf('B', 'equals', 2),
        createLeaf('C', 'equals', 3),
      ]),
    ])

    const core = toCoreCondition(tree)
    assert.equal(core.kind, 'group')
    if (core.kind !== 'group') return
    assert.equal(core.combinator, 'and')
    assert.equal(core.children[1].kind, 'group')
    const nested = core.children[1]
    if (nested.kind !== 'group') return
    assert.equal(nested.combinator, 'or')
    assert.equal(nested.children.length, 2)
  })
})

describe('rule-model · 树变更（不可变 + 结构共享）', () => {
  it('addChild：只在指定组下追加，路径外引用不变', () => {
    const root = createGroup('and', [createLeaf('a')])
    const child = createLeaf('b')

    const next = addChild(root, root.nodeId, child)

    assert.equal(next.kind, 'group')
    if (next.kind !== 'group' || root.kind !== 'group') return
    assert.equal(next.children.length, 2)
    assert.equal(next.children[0], root.children[0]) // 结构共享
  })

  it('updateNode：改叶子的值/操作符/字段', () => {
    const leaf = createLeaf('customerType', 'equals', 'person')
    const next = updateNode(leaf, leaf.nodeId, { value: 'company' })

    assert.equal(next.kind, 'condition')
    if (next.kind !== 'condition') return
    assert.equal(next.value, 'company')
  })

  it('updateNode：改组的 combinator（and → or）', () => {
    const root = createGroup('and', [createLeaf('a')])
    const next = updateNode(root, root.nodeId, { combinator: 'or' })

    assert.equal(next.kind, 'group')
    if (next.kind !== 'group') return
    assert.equal(next.combinator, 'or')
  })

  it('removeNode：删除子树；根不可删', () => {
    const grandchild = createLeaf('x')
    const subgroup = createGroup('or', [grandchild])
    const root = createGroup('and', [createLeaf('a'), subgroup])

    const next = removeNode(root, grandchild.nodeId)
    assert.equal(next.kind, 'group')
    if (next.kind !== 'group') return
    assert.equal(next.children[1].kind, 'group')
    const nextSub = next.children[1]
    if (nextSub.kind !== 'group') return
    assert.equal(nextSub.children.length, 0)

    assert.strictEqual(removeNode(root, root.nodeId), root)
  })
})

describe('rule-model · 动作（then）', () => {
  it('upsertAction：生成 companyName: { visible:true, required:true }', () => {
    let then = upsertAction({}, 'companyName', { visible: true })
    then = upsertAction(then, 'companyName', { required: true })

    assert.deepEqual(then, {
      companyName: { visible: true, required: true },
    })
  })

  it('空字段名不产生动作；removeAction 摘除目标字段', () => {
    const then = upsertAction({ companyName: { visible: true } }, '', { required: true })
    assert.deepEqual(then, { companyName: { visible: true } })

    assert.deepEqual(removeAction(then, 'companyName'), {})
  })
})
