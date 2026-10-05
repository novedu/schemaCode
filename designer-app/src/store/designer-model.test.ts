import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { ComponentTemplate, FieldNode } from '../model/designer-types'
import {
  addNode,
  createNodeFromTemplate,
  moveNode,
  removeNode,
  uniqueFieldName,
  updateNode,
} from './designer-model'

/* 夹具 */
const moneyTemplate: ComponentTemplate = {
  component: 'MoneyInput',
  label: '金额',
  defaultField: 'amount',
  defaultLabel: '金额',
  defaultProps: { precision: 2, currency: 'CNY' },
  icon: 'Money',
}

function node(overrides: Partial<FieldNode> = {}): FieldNode {
  return {
    id: 'n1',
    kind: 'field',
    field: 'amount',
    label: '金额',
    component: 'MoneyInput',
    props: { precision: 2 },
    required: false,
    ...overrides,
  }
}

describe('designer-model · 节点创建', () => {
  it('createNodeFromTemplate：按物料模板生成节点', () => {
    const n = createNodeFromTemplate(moneyTemplate, [])

    assert.equal(n.kind, 'field')
    assert.equal(n.field, 'amount')
    assert.equal(n.component, 'MoneyInput')
    assert.deepEqual(n.props, { precision: 2, currency: 'CNY' })
  })

  it('同名字段自动追加序号（撞名保护）', () => {
    const existing = [node({ field: 'amount' })]
    const n = createNodeFromTemplate(moneyTemplate, existing)

    assert.equal(n.field, 'amount_2')
    assert.equal(uniqueFieldName('amount', [
      node({ field: 'amount' }),
      node({ id: 'n2', field: 'amount_2' }),
    ]), 'amount_3')
  })
})

describe('designer-model · 增删改移动（不可变）', () => {
  it('addNode：原数组不变，返回含新节点的数组', () => {
    const a = node({ id: 'a' })
    const b = node({ id: 'b', field: 'other' })

    const next = addNode([a], b)

    assert.equal(next.length, 2)
    assert.deepEqual([a], [node({ id: 'a' })]) // 原数组未变
  })

  it('addNode 支持插入到指定位置', () => {
    const a = node({ id: 'a' })
    const b = node({ id: 'b' })
    const c = node({ id: 'c' })

    const next = addNode([a, c], b, 1)
    assert.deepEqual(next.map((n) => n.id), ['a', 'b', 'c'])
  })

  it('removeNode：删除指定 id，其余保留', () => {
    const next = removeNode(
      [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })],
      'b',
    )
    assert.deepEqual(next.map((n) => n.id), ['a', 'c'])
  })

  it('updateNode：patch 浅合并；props 单独浅合并不丢未改键', () => {
    const next = updateNode(
      [node({ id: 'a', props: { precision: 2, currency: 'CNY' } })],
      'a',
      { props: { precision: 4 } },
    )

    const merged = next[0] as FieldNode
    assert.equal(merged.props.precision, 4)
    assert.equal(merged.props.currency, 'CNY') // 未改键保留
    assert.equal(merged.label, '金额') // 未在 patch 中的属性保留
  })

  it('moveNode：上移/下移；越界返回原数组', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })]

    assert.deepEqual(moveNode(nodes, 'b', -1).map((n) => n.id), ['b', 'a', 'c'])
    assert.deepEqual(moveNode(nodes, 'b', 1).map((n) => n.id), ['a', 'c', 'b'])
    assert.strictEqual(moveNode(nodes, 'a', -1), nodes)
    assert.strictEqual(moveNode(nodes, 'c', 1), nodes)
    assert.strictEqual(moveNode(nodes, 'x', -1), nodes)
  })

  it('updateNode 改字段名撞名时自动避让', () => {
    const nodes = [node({ id: 'a', field: 'amount' }), node({ id: 'b', field: 'money' })]

    const next = updateNode(nodes, 'b', { field: 'amount' })
    assert.equal((next[1] as FieldNode).field, 'amount_2')
  })
})
