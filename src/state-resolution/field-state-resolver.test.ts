import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type {
  FieldState,
  FormData,
  RuntimeContext,
  Schema,
  StateSource,
} from '../types'
import { defaultFieldState } from '../engine/field-state'
import { createRuntimeContext } from '../runtime/runtime-context'
import { resolveFieldStates } from './field-state-resolver'
import { provideBpmState } from './bpm-state-provider'
import { providePermissionState } from './permission-state-provider'
import { provideRuleState } from './rule-state-provider'
import { resolveOAFieldStates } from './oa-state-runtime'
import { warningRules } from '../rules/warning-rules'
import { renderForm } from '../renderer/renderer'
import { schema } from '../schema'

/* ── 测试辅助 ── */

/** 用给定字段构造最小 Schema（initialState 都取默认值，可被覆盖） */
function makeSchema(
  fields: { name: string; initial?: Partial<FieldState> }[],
): Schema {
  return {
    fields: fields.map((f) => ({
      name: f.name,
      label: f.name,
      type: 'text' as const,
      initialState: defaultFieldState(f.initial),
    })),
  }
}

function source(
  name: StateSource['name'],
  patches: StateSource['patches'],
): StateSource {
  return { name, patches }
}

function formData(overrides: Partial<FormData> = {}): FormData {
  return {
    customerType: 'person',
    companyName: '',
    registeredCapital: 0,
    amount: 0,
    approveComment: '',
    ...overrides,
  }
}

/* ═══════════════════ 四个强制冲突案例 ═══════════════════ */

describe('State Resolution · 冲突案例', () => {
  const miniSchema = makeSchema([{ name: 'amount' }])

  it('案例1：Schema editable:true + BPM readonly:true → readonly:true 且 editable:false（语义规范化）', () => {
    const { fieldStates } = resolveFieldStates(miniSchema, [
      source('schema', { amount: { editable: true } }),
      source('bpm', { amount: { readonly: true } }),
    ])

    assert.equal(fieldStates.amount.readonly, true)
    assert.equal(fieldStates.amount.editable, false)
  })

  it('案例2：Schema required:true + Rule required:false → required:false（Rule 优先级高于 Schema）', () => {
    const schemaWithRequired = makeSchema([
      { name: 'amount', initial: { required: true } },
    ])
    const { fieldStates } = resolveFieldStates(schemaWithRequired, [
      source('rule', { amount: { required: false } }),
    ])

    assert.equal(fieldStates.amount.required, false)
  })

  it('案例3：Rule editable:true + Permission editable:false → editable:false（安全权限最高）', () => {
    const { fieldStates } = resolveFieldStates(miniSchema, [
      source('rule', { amount: { editable: true } }),
      source('permission', { amount: { editable: false } }),
    ])

    assert.equal(fieldStates.amount.editable, false)
  })

  it('案例4：多条 warnings 合并、去重，且不被高优先级来源抹掉', () => {
    const { fieldStates } = resolveFieldStates(miniSchema, [
      source('rule', {
        amount: {
          editable: true,
          warnings: ['金额超过5000', '需要经理审批'],
        },
      }),
      source('permission', {
        amount: {
          editable: false,
          warnings: ['金额超过5000'], // 与上面重复
        },
      }),
    ])

    assert.deepEqual(fieldStates.amount.warnings, [
      '金额超过5000',
      '需要经理审批',
    ])
  })
})

describe('State Resolution · 优先级契约不依赖调用顺序', () => {
  const miniSchema = makeSchema([{ name: 'amount' }])

  it('即使 sources 数组乱序（permission 在前），结论仍按 Permission>BPM>Rule>Schema', () => {
    const sources = [
      source('permission', { amount: { editable: false } }),
      source('schema', { amount: { editable: true, required: true } }),
      source('rule', { amount: { required: false } }),
      source('bpm', { amount: { readonly: true } }),
    ]

    const { fieldStates } = resolveFieldStates(miniSchema, sources)
    assert.equal(fieldStates.amount.editable, false)
    assert.equal(fieldStates.amount.readonly, true)
    assert.equal(fieldStates.amount.required, false)
  })

  it('未表态的来源不影响结果；没有任何来源时字段保持中性默认值', () => {
    const { fieldStates } = resolveFieldStates(miniSchema, [])
    assert.deepEqual(fieldStates.amount, defaultFieldState())
  })
})

/* ═══════════════════ Provider 单元测试 ═══════════════════ */

describe('State Providers · 输出只含补丁', () => {
  it('BPM：manager_approve → amount readonly:true/editable:false', () => {
    const ctx: RuntimeContext = createRuntimeContext({
      task: { node: 'manager_approve' },
    })
    assert.deepEqual(provideBpmState(ctx), {
      amount: { readonly: true, editable: false },
    })
  })

  it('BPM：未知节点 → 空补丁表（不猜测默认限制）', () => {
    const ctx: RuntimeContext = createRuntimeContext({
      task: { node: 'not_exist_node' },
    })
    assert.deepEqual(provideBpmState(ctx), {})
  })

  it('Permission：只读实例 → amount editable:false/disabled:true', () => {
    const ctx: RuntimeContext = createRuntimeContext({
      task: { node: 'employee_fill' },
      user: { roles: ['employee'] },
      permissions: { editable: false },
    })
    const patches = providePermissionState(ctx)
    assert.equal(patches.amount.editable, false)
    assert.equal(patches.amount.disabled, true)
  })

  it('Permission：manager 角色 → approveComment 可见/必填/可编辑，覆盖 employee 的隐藏', () => {
    const ctx: RuntimeContext = createRuntimeContext({
      task: { node: 'manager_approve' },
      user: { roles: ['employee', 'manager'] },
    })
    const patches = providePermissionState(ctx)
    assert.equal(patches.approveComment.visible, true)
    assert.equal(patches.approveComment.required, true)
    assert.equal(patches.approveComment.editable, true)
  })

  it('Rule：amount>5000 的业务规则产出 warning 补丁；3000 时不产出', () => {
    const hit = provideRuleState(warningRules, formData({ amount: 6000 }))
    assert.equal(hit.amount.warnings!.length, 1)

    const miss = provideRuleState(warningRules, formData({ amount: 3000 }))
    assert.deepEqual(miss, {})
  })
})

/* ═══════════════════ 完整 OA Runtime 场景 ═══════════════════ */

describe('OA State Runtime · 完整链路', () => {
  it('员工填写节点：amount editable:true/readonly:false', () => {
    const ctx = createRuntimeContext({
      task: { node: 'employee_fill' },
      user: { roles: ['employee'] },
    })
    const { fieldStates } = resolveOAFieldStates(
      schema,
      formData({ amount: 3000 }),
      ctx,
    )

    assert.equal(fieldStates.amount.editable, true)
    assert.equal(fieldStates.amount.readonly, false)
    assert.equal(fieldStates.amount.disabled, false)
    assert.equal(fieldStates.approveComment.visible, false)
  })

  it('经理审批节点：amount editable:false/readonly:true，审批意见可见必填', () => {
    const ctx = createRuntimeContext({
      task: { node: 'manager_approve' },
      user: { roles: ['manager'] },
    })
    const { fieldStates } = resolveOAFieldStates(
      schema,
      formData({ amount: 3000 }),
      ctx,
    )

    assert.equal(fieldStates.amount.editable, false)
    assert.equal(fieldStates.amount.readonly, true)
    // 回归保护：业务规则只给 warning，不能把 Schema 的 required:true 冲成 false
    assert.equal(fieldStates.amount.required, true)
    assert.equal(fieldStates.approveComment.visible, true)
    assert.equal(fieldStates.approveComment.required, true)
  })

  it('amount=6000：warnings 含金额超5000提示；与经理节点只读叠加共存', () => {
    const ctx = createRuntimeContext({
      task: { node: 'manager_approve' },
      user: { roles: ['manager'] },
    })
    const { fieldStates } = resolveOAFieldStates(
      schema,
      formData({ amount: 6000 }),
      ctx,
    )

    assert.equal(fieldStates.amount.readonly, true)
    assert.equal(fieldStates.amount.warnings.length, 1)
    assert.match(fieldStates.amount.warnings[0], /5000/)
  })

  it('只读实例压过员工节点：permission 最高优先级，amount 禁用', () => {
    const ctx = createRuntimeContext({
      task: { node: 'employee_fill' },
      user: { roles: ['employee'] },
      permissions: { editable: false },
    })
    const { fieldStates } = resolveOAFieldStates(
      schema,
      formData({ amount: 1000 }),
      ctx,
    )

    assert.equal(fieldStates.amount.disabled, true)
    assert.equal(fieldStates.amount.editable, false)
    assert.equal(fieldStates.amount.readonly, false)
  })

  it('决策轨迹（trace）：amount 的 editable 最终由 bpm 决定', () => {
    const ctx = createRuntimeContext({
      task: { node: 'manager_approve' },
      user: { roles: ['manager'] },
    })
    const { traces } = resolveOAFieldStates(
      schema,
      formData({ amount: 3000 }),
      ctx,
      { trace: true },
    )
    const amountTrace = traces.find((t) => t.field === 'amount')!
    assert.equal(amountTrace.decidedBy.readonly, 'bpm')
  })

  it('最终状态直送 Renderer：产出真实 VNode，经理节点 amount 带 readonly', () => {
    const ctx = createRuntimeContext({
      task: { node: 'manager_approve' },
      user: { roles: ['manager'] },
    })
    const data = formData({ amount: 6000 })
    const { fieldStates } = resolveOAFieldStates(schema, data, ctx)

    const nodes = renderForm(schema, data, fieldStates)
    const amountNode = nodes.find((n) => n.field === 'amount')!
    assert.equal(
      (amountNode.vnode.type as { name?: string }).name,
      'MoneyInput',
    )
    assert.equal(amountNode.vnode.props?.readonly, true)
    assert.ok(nodes.some((n) => n.field === 'approveComment'))
  })
})
