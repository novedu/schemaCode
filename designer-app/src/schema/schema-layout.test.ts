import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type {
  FieldState,
  FieldStatePatch,
  LayoutContainerNode,
  LayoutNode,
  Rule,
  RuntimeContext,
  Schema,
  StatePatchMap,
} from '@runtime-core/types'
import { resolveFieldStates } from '@runtime-core/state-resolution/field-state-resolver'
import { provideSchemaState } from '@runtime-core/state-resolution/schema-state-provider'
import { buildSchema, schemaToNodes } from './schema-builder'
import type { CanvasNode, ContainerNode, FieldNode } from '../model/designer-types'

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

function containerNode(
  id: string,
  label: string,
  children: CanvasNode[],
): ContainerNode {
  return { id, kind: 'container', label, children }
}

/** 带容器的节点树：
 *   基本信息 ── customerName
 *   分组容器 ── qty
 *   remark
 */
function treeWithContainers(): CanvasNode[] {
  return [
    containerNode('c1', '基本信息', [
      fieldNode({ id: 'a', field: 'customerName', label: '客户名称', component: 'TextInput', props: {}, required: false }),
    ]),
    containerNode('c2', '产品信息', [
      fieldNode({ id: 'b', field: 'qty', label: '数量', component: 'NumberInput', props: {}, required: false }),
    ]),
    fieldNode({ id: 'c', field: 'remark', label: '备注', component: 'TextInput', props: {}, required: false }),
  ]
}

/* ── Test 6/7 前置：buildSchema 产物结构 ── */

describe('schema-layout · buildSchema（Container → fields + layout）', () => {
  it('fields 为全树扁平清单（深度优先），布局无关推理链路', () => {
    const schema = buildSchema(treeWithContainers())

    assert.deepEqual(schema.fields.map((f) => f.name), [
      'customerName',
      'qty',
      'remark',
    ])
  })

  it('layout 树携带 Container 层级；字段以引用（field 名）出现', () => {
    const schema = buildSchema(treeWithContainers())
    const layout = schema.layout!

    assert.equal(layout.length, 3)
    const [first, second, third] = layout

    assert.equal(first.kind, 'container')
    assert.equal((first as LayoutContainerNode).label, '基本信息')
    assert.deepEqual(
      (first as LayoutContainerNode).children,
      [{ kind: 'field', field: 'customerName' }],
    )
    assert.equal((second as LayoutContainerNode).label, '产品信息')
    assert.equal(third.kind, 'field')
    assert.equal((third as { field: string }).field, 'remark')
  })

  it('无容器时不输出 layout（与既有扁平 Schema 完全一致）', () => {
    const schema = buildSchema([fieldNode({ id: 'a' })])

    assert.equal(schema.layout, undefined)
    assert.equal(schema.fields.length, 1)
  })
})

/* ── Test 6：Schema 持久恢复（Schema → Canvas 层级保持） ── */

describe('schema-layout · Test 6 schemaToNodes 持久恢复', () => {
  it('带 layout 的 Schema 反向解析后层级/标题/字段属性保持', () => {
    const original = treeWithContainers()
    const schema = buildSchema(original)

    let seq = 0
    const restored = schemaToNodes(schema, () => `imp_${++seq}`)

    assert.equal(restored.length, 3)

    const [first, second, third] = restored
    assert.equal(first.kind, 'container')
    assert.equal((first as ContainerNode).label, '基本信息')
    assert.equal((first as ContainerNode).children[0].kind, 'field')
    assert.equal(((first as ContainerNode).children[0] as FieldNode).field, 'customerName')

    assert.equal(second.kind, 'container')
    assert.equal((second as ContainerNode).label, '产品信息')

    assert.equal(third.kind, 'field')
    assert.equal((third as FieldNode).field, 'remark')
    assert.equal((third as FieldNode).component, 'TextInput')
    assert.equal((third as FieldNode).required, false)
  })

  it('恢复后再次 buildSchema 得到等价 Schema（往返一致）', () => {
    const schema = buildSchema(treeWithContainers())
    const restored = schemaToNodes(schema, () => 'x')
    const again = buildSchema(restored)

    assert.deepEqual(again, schema)
  })

  it('旧扁平 Schema（无 layout）仍按平铺解析（向后兼容）', () => {
    const flat: Schema = {
      fields: [
        {
          name: 'amount',
          label: '金额',
          type: 'number',
          initialState: baseState(),
        },
      ],
    }

    const nodes = schemaToNodes(flat)
    assert.equal(nodes.length, 1)
    assert.equal(nodes[0].kind, 'field')
    assert.equal((nodes[0] as FieldNode).component, 'NumberInput')
  })
})

/* ── Test 7：Bundle 三部分不被 Container 破坏 ── */

describe('schema-layout · Test 7 Bundle 一致性', () => {
  it('容器化 Schema 的 fields 完整且顺序确定（rules/permissions 依赖字段名照常工作）', () => {
    const schema = buildSchema(treeWithContainers())

    // rules / permissions 都按字段名引用 —— fields 扁平清单完整即可
    const fieldNames = schema.fields.map((f) => f.name)
    assert.equal(fieldNames.length, 3)
    assert.deepEqual([...fieldNames].sort(), ['customerName', 'qty', 'remark'])

    // layout 引用的每个字段都在 fields 中（Schema 生产方契约）
    for (const ref of collectFieldRefs(schema.layout ?? [])) {
      assert.ok(fieldNames.includes(ref), `layout 引用字段 ${ref} 必须存在于 fields`)
    }
  })

  it('同一批字段无论是否在容器内，buildSchema 的 fields 逐项等价', () => {
    const flatFields = [
      fieldNode({ id: 'a', field: 'customerName', label: '客户名称', component: 'TextInput', props: {}, required: false }),
      fieldNode({ id: 'b', field: 'qty', label: '数量', component: 'NumberInput', props: {}, required: false }),
      fieldNode({ id: 'c', field: 'remark', label: '备注', component: 'TextInput', props: {}, required: false }),
    ]

    const fromTree = buildSchema(treeWithContainers())
    const fromFlat = buildSchema(flatFields)

    assert.deepEqual(fromTree.fields, fromFlat.fields)
  })
})

/* ── Test 8：Runtime 行为不变（employee/manager/finance 权限场景） ── */

describe('schema-layout · Test 8 Runtime 权限行为不变', () => {
  const rule: Rule = {
    name: '大额需审批提示',
    when: { kind: 'condition', field: 'amount', operator: 'greaterThan', value: 5000 },
    then: { amount: { warnings: ['金额超过 5000，请附发票'] } },
  }

  /** 权限查表（与 demo-app 适配器同构）：按角色挑条目生成补丁表 */
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

  /** 复刻核心四来源装配（与 demo-app adapter 同一接入模式） */
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
    // 直接内联规则求值：命中即打补丁（与核心引擎语义一致）
    const hit = rule.when.kind === 'condition'
      && Number(data[rule.when.field]) > Number(rule.when.value)
    return hit ? { amount: { ...rule.then.amount } } : {}
  }

  it('amount 在 Container 内：employee editable / manager readonly / finance editable', () => {
    // amount 位于"产品信息"容器内
    const tree: CanvasNode[] = [
      containerNode('c1', '基本信息', [
        fieldNode({ id: 'a', field: 'customerName', label: '客户名称', component: 'TextInput', props: {}, required: false }),
      ]),
      containerNode('c2', '产品信息', [
        fieldNode({ id: 'amt', field: 'amount', label: '报销金额' }),
      ]),
    ]
    const schema = buildSchema(tree)

    const employee = resolveAmountFor(['employee'], schema)
    const manager = resolveAmountFor(['manager'], schema)
    const finance = resolveAmountFor(['finance'], schema)

    assert.equal(employee.editable, true)
    assert.equal(employee.readonly, false)

    assert.equal(manager.readonly, true)
    assert.equal(manager.editable, false) // 核心规范化：readonly → editable=false

    assert.equal(finance.editable, true)
    assert.equal(finance.readonly, false)
  })

  it('与同一字段不在容器内（扁平 Schema）的裁决结果完全一致', () => {
    const flatSchema = buildSchema([
      fieldNode({ id: 'a', field: 'customerName', label: '客户名称', component: 'TextInput', props: {}, required: false }),
      fieldNode({ id: 'amt', field: 'amount', label: '报销金额' }),
    ])

    for (const roles of [['employee'], ['manager'], ['finance']]) {
      const inContainer = resolveAmountFor(roles, buildSchema([
        containerNode('c1', '基本信息', [
          fieldNode({ id: 'a', field: 'customerName', label: '客户名称', component: 'TextInput', props: {}, required: false }),
        ]),
        containerNode('c2', '产品信息', [
          fieldNode({ id: 'amt', field: 'amount', label: '报销金额' }),
        ]),
      ]))
      const flat = resolveAmountFor(roles, flatSchema)

      assert.deepEqual(inContainer, flat)
    }
  })
})

/* ── 辅助 ── */

function baseState(): FieldState {
  return {
    visible: true,
    required: false,
    disabled: false,
    readonly: false,
    editable: true,
    warnings: [],
  }
}

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
