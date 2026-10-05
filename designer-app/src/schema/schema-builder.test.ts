import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { buildSchema, schemaToNodes } from './schema-builder'
import type { FieldNode } from '../model/designer-types'

/* 夹具 */
function fieldNode(overrides: Partial<FieldNode> = {}): FieldNode {
  return {
    id: 'n1',
    kind: 'field',
    field: 'amount',
    label: '金额',
    component: 'MoneyInput',
    props: { precision: 2, currency: 'CNY' },
    required: true,
    ...overrides,
  }
}

describe('schema-builder · buildSchema（设计器节点 → Runtime Core Schema）', () => {
  it('字段按节点顺序翻译，name/label/component 一一对应', () => {
    const nodes = [
      fieldNode({ id: 'a', field: 'name', label: '名称', component: 'TextInput', props: {}, required: false }),
      fieldNode({ id: 'b', field: 'amount', label: '金额', component: 'MoneyInput' }),
    ]

    const schema = buildSchema(nodes)

    assert.equal(schema.fields.length, 2)
    assert.equal(schema.fields[0].name, 'name')
    assert.equal(schema.fields[0].component, 'TextInput')
    assert.equal(schema.fields[0].type, 'text')
    assert.equal(schema.fields[1].component, 'MoneyInput')
    assert.equal(schema.fields[1].type, 'number')
  })

  it('props 透传；空 props 不写入产物', () => {
    const withProps = buildSchema([fieldNode()])
    const withoutProps = buildSchema([fieldNode({ props: {} })])

    assert.deepEqual(withProps.fields[0].props, { precision: 2, currency: 'CNY' })
    assert.equal(withoutProps.fields[0].props, undefined)
  })

  it('required 写入核心 initialState（复用 defaultFieldState）', () => {
    const required = buildSchema([fieldNode({ required: true })])
    const optional = buildSchema([fieldNode({ required: false })])

    assert.equal(required.fields[0].initialState.required, true)
    assert.equal(optional.fields[0].initialState.required, false)
  })

  it('Select 的 options 透传', () => {
    const nodes = [
      fieldNode({
        field: 'type',
        label: '类型',
        component: 'SelectInput',
        props: {},
        options: [
          { label: '个人', value: 'person' },
          { label: '公司', value: 'company' },
        ],
      }),
    ]

    const schema = buildSchema(nodes)
    assert.deepEqual(schema.fields[0].options, [
      { label: '个人', value: 'person' },
      { label: '公司', value: 'company' },
    ])
  })
})

describe('schema-builder · schemaToNodes（反向解析，设计⇄Runtime 闭环）', () => {
  it('Runtime Schema 可反向解析为节点，字段值保持一致', () => {
    const original = [
      fieldNode({ id: 'x', field: 'amount', label: '金额', component: 'MoneyInput' }),
    ]
    const schema = buildSchema(original)

    let idSeq = 0
    const nodes = schemaToNodes(schema, () => `imp_${++idSeq}`)

    assert.equal(nodes.length, 1)
    const restored = nodes[0] as FieldNode
    assert.equal(restored.field, 'amount')
    assert.equal(restored.component, 'MoneyInput')
    assert.equal(restored.required, true)
    assert.deepEqual(restored.props, { precision: 2, currency: 'CNY' })
  })

  it('未显式声明 component 的 Schema 按 type 推断组件', () => {
    const schema = {
      fields: [
        {
          name: 'qty',
          label: '数量',
          type: 'number' as const,
          initialState: {
            visible: true,
            required: false,
            disabled: false,
            readonly: false,
            editable: true,
            warnings: [],
          },
        },
      ],
    }

    const nodes = schemaToNodes(schema)
    assert.equal((nodes[0] as FieldNode).component, 'NumberInput')
  })
})
