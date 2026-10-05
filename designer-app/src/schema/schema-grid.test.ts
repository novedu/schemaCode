import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type {
  FieldState,
  FieldStatePatch,
  LayoutGridNode,
  LayoutNode,
  Rule,
  RuntimeContext,
  Schema,
  StatePatchMap,
} from '@runtime-core/types'
import { resolveFieldStates } from '@runtime-core/state-resolution/field-state-resolver'
import { provideSchemaState } from '@runtime-core/state-resolution/schema-state-provider'
import { buildSchema, schemaToNodes } from './schema-builder'
import type { CanvasNode, FieldNode, GridNode } from '../model/designer-types'

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

function gridNode(
  id: string,
  label: string,
  columns: { id: string; children: FieldNode[] }[],
): GridNode {
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

/** 带栅格的节点树：
 *   栅格 ── col1: amount, phone
 *         ── col2: note
 *   remark
 */
function treeWithGrid(): CanvasNode[] {
  return [
    gridNode('g1', '两列栅格', [
      { id: 'col1', children: [
        fieldNode({ id: 'a', field: 'amount', label: '金额', component: 'MoneyInput', props: { precision: 2, currency: 'CNY' }, required: true }),
        fieldNode({ id: 'b', field: 'phone', label: '电话', component: 'TextInput', props: {}, required: false }),
      ]},
      { id: 'col2', children: [
        fieldNode({ id: 'c', field: 'note', label: '备注', component: 'TextInput', props: {}, required: false }),
      ]},
    ]),
    fieldNode({ id: 'd', field: 'remark', label: '备注', component: 'TextInput', props: {}, required: false }),
  ]
}

/* ── Test 1/2：buildSchema 产物结构 ── */

describe('schema-grid · buildSchema（Grid → fields + layout）', () => {
  it('fields 为全树扁平清单（深度优先：列序+列内序）', () => {
    const schema = buildSchema(treeWithGrid())

    assert.deepEqual(schema.fields.map((f) => f.name), [
      'amount',
      'phone',
      'note',
      'remark',
    ])
  })

  it('layout 树携带 Grid 层级；字段以引用（field 名）出现', () => {
    const schema = buildSchema(treeWithGrid())
    const layout = schema.layout!

    assert.equal(layout.length, 2)
    const [first, second] = layout

    assert.equal(first.kind, 'grid')
    assert.equal((first as LayoutGridNode).label, '两列栅格')
    assert.equal((first as LayoutGridNode).columns.length, 2)
    assert.deepEqual(
      (first as LayoutGridNode).columns[0].children,
      [{ kind: 'field', field: 'amount' }, { kind: 'field', field: 'phone' }],
    )
    assert.deepEqual(
      (first as LayoutGridNode).columns[1].children,
      [{ kind: 'field', field: 'note' }],
    )
    assert.equal(second.kind, 'field')
    assert.equal((second as { field: string }).field, 'remark')
  })

  it('无栅格时不输出 layout（与既有扁平 Schema 完全一致）', () => {
    const schema = buildSchema([fieldNode({ id: 'a' })])

    assert.equal(schema.layout, undefined)
    assert.equal(schema.fields.length, 1)
  })
})

/* ── Test 3：Schema 持久恢复（Schema → Canvas 层级保持） ── */

describe('schema-grid · schemaToNodes 持久恢复', () => {
  it('带 Grid 的 Schema 反向解析后层级/标题/字段属性保持', () => {
    const original = treeWithGrid()
    const schema = buildSchema(original)

    let seq = 0
    const restored = schemaToNodes(schema, () => `imp_${++seq}`)

    assert.equal(restored.length, 2)

    const [first, second] = restored
    assert.equal(first.kind, 'grid')
    assert.equal((first as GridNode).label, '两列栅格')
    assert.equal((first as GridNode).columns.length, 2)
    assert.equal((first as GridNode).columns[0].children.length, 2)
    assert.equal((first as GridNode).columns[0].children[0].kind, 'field')
    assert.equal(((first as GridNode).columns[0].children[0] as FieldNode).field, 'amount')
    assert.equal(((first as GridNode).columns[0].children[0] as FieldNode).required, true)

    assert.equal(second.kind, 'field')
    assert.equal((second as FieldNode).field, 'remark')
  })

  it('恢复后再次 buildSchema 得到等价 Schema（往返一致）', () => {
    const schema = buildSchema(treeWithGrid())
    const restored = schemaToNodes(schema, () => 'x')
    const again = buildSchema(restored)

    assert.deepEqual(again, schema)
  })
})

/* ── Test 4：Bundle 一致性（Grid 不破坏 fields） ── */

describe('schema-grid · Bundle 一致性', () => {
  it('同一批字段无论是否在栅格内，buildSchema 的 fields 逐项等价', () => {
    const flatFields = [
      fieldNode({ id: 'a', field: 'amount', label: '金额', component: 'MoneyInput', props: { precision: 2, currency: 'CNY' }, required: true }),
      fieldNode({ id: 'b', field: 'phone', label: '电话', component: 'TextInput', props: {}, required: false }),
      fieldNode({ id: 'c', field: 'note', label: '备注', component: 'TextInput', props: {}, required: false }),
      fieldNode({ id: 'd', field: 'remark', label: '备注', component: 'TextInput', props: {}, required: false }),
    ]

    const fromTree = buildSchema(treeWithGrid())
    const fromFlat = buildSchema(flatFields)

    assert.deepEqual(fromTree.fields, fromFlat.fields)
  })

  it('layout 引用的每个字段都在 fields 中（Schema 生产方契约）', () => {
    const schema = buildSchema(treeWithGrid())
    const fieldNames = schema.fields.map((f) => f.name)

    for (const ref of collectFieldRefs(schema.layout ?? [])) {
      assert.ok(fieldNames.includes(ref), `layout 引用字段 ${ref} 必须存在于 fields`)
    }
  })
})

/* ── Test 5：Runtime 行为不变（权限场景） ── */

describe('schema-grid · Runtime 权限行为不变', () => {
  const rule: Rule = {
    name: '大额需审批提示',
    when: { kind: 'condition', field: 'amount', operator: 'greaterThan', value: 5000 },
    then: { amount: { warnings: ['金额超过 5000，请附发票'] } },
  }

  function permissionPatches(
    entries: { field: string; role: string; patch: FieldStatePatch }[],
    roles: string[],
  ): StatePatchMap {
    const set = new Set(roles)
    const result: StatePatchMap = {}
    for (const entry of entries) {
      if (!set.has(entry.role)) continue
      result[entry.field] = { ...result[entry.field], ...entry.patch }
    }
    return result
  }

  const entries = [
    { field: 'amount', role: 'employee', patch: { editable: true } },
    { field: 'amount', role: 'manager', patch: { readonly: true } },
    { field: 'amount', role: 'finance', patch: { editable: true } },
  ]

  function resolveAmountFor(roles: string[], schema: Schema): FieldState {
    const data = { amount: 6800 } as unknown as Record<string, unknown>
    const ctx = {
      schemaVersion: 'v1',
      task: { taskId: 'T1', node: `${roles[0]}_node` },
      user: { userId: 'u1', name: '张三', roles },
      permissions: { editable: true },
    } as RuntimeContext

    const sources = [
      { name: 'schema' as const, patches: provideSchemaState(schema) },
      { name: 'rule' as const, patches: runRules(schema, data) },
      { name: 'bpm' as const, patches: {} },
      { name: 'permission' as const, patches: permissionPatches(entries, roles) },
    ]
    void ctx
    return resolveFieldStates(schema, sources).fieldStates.amount
  }

  function runRules(schema: Schema, data: Record<string, unknown>): StatePatchMap {
    const hit = rule.when.kind === 'condition'
      && Number(data[rule.when.field]) > Number(rule.when.value)
    return hit ? { amount: { ...rule.then.amount } } : {}
  }

  it('amount 在 Grid 内：employee editable / manager readonly / finance editable', () => {
    const tree: CanvasNode[] = [
      gridNode('g1', '两列栅格', [
        { id: 'col1', children: [
          fieldNode({ id: 'amt', field: 'amount', label: '报销金额' }),
        ]},
        { id: 'col2', children: [] },
      ]),
    ]
    const schema = buildSchema(tree)

    const employee = resolveAmountFor(['employee'], schema)
    const manager = resolveAmountFor(['manager'], schema)
    const finance = resolveAmountFor(['finance'], schema)

    assert.equal(employee.editable, true)
    assert.equal(employee.readonly, false)

    assert.equal(manager.readonly, true)
    assert.equal(manager.editable, false)

    assert.equal(finance.editable, true)
    assert.equal(finance.readonly, false)
  })

  it('与同一字段不在栅格内（扁平 Schema）的裁决结果完全一致', () => {
    const flatSchema = buildSchema([
      fieldNode({ id: 'amt', field: 'amount', label: '报销金额' }),
    ])

    for (const roles of [['employee'], ['manager'], ['finance']]) {
      const inGrid = resolveAmountFor(roles, buildSchema([
        gridNode('g1', '两列栅格', [
          { id: 'col1', children: [
            fieldNode({ id: 'amt', field: 'amount', label: '报销金额' }),
          ]},
          { id: 'col2', children: [] },
        ]),
      ]))
      const flat = resolveAmountFor(roles, flatSchema)

      assert.deepEqual(inGrid, flat)
    }
  })
})

/* ── 辅助 ── */

function collectFieldRefs(layout: LayoutNode[]): string[] {
  const result: string[] = []
  for (const node of layout) {
    if (node.kind === 'field') result.push(node.field)
    else if (node.kind === 'container') result.push(...collectFieldRefs(node.children))
    else if (node.kind === 'grid') {
      for (const col of node.columns) {
        result.push(...collectFieldRefs(col.children))
      }
    }
  }
  return result
}
