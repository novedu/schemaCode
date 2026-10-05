import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { FormData, RuntimeContext } from '../types'
import { RuleScheduler } from '../scheduler/rule-scheduler'
import { oaRules } from '../rules/oa-rules'
import { createRuntimeContext } from './runtime-context'
import { buildRenderConfigs, renderForm } from '../renderer/renderer'
import { schema } from '../schema'

/** 跑一次完整 OA Runtime：上下文 + 数据 → 调度器 → FieldState */
function runOA(ctx: RuntimeContext, data: FormData) {
  const scheduler = new RuleScheduler(schema, oaRules)
  return scheduler.schedule(data, undefined, ctx).fieldStates
}

const employeeCtx = createRuntimeContext({
  task: { taskId: '10001', node: 'employee_fill' },
  user: { roles: ['employee'] },
  permissions: { editable: true },
})

const managerCtx = createRuntimeContext({
  task: { taskId: '10002', node: 'manager_approve' },
  user: { roles: ['manager'] },
  permissions: { editable: true },
})

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

describe('OA Runtime · 场景1：员工填写节点', () => {
  const states = runOA(employeeCtx, formData({ amount: 3000 }))

  it('amount 可编辑、非只读', () => {
    assert.equal(states.amount.editable, true)
    assert.equal(states.amount.readonly, false)
    assert.equal(states.amount.disabled, false)
  })

  it('审批意见对员工不可见', () => {
    assert.equal(states.approveComment.visible, false)
  })
})

describe('OA Runtime · 场景2：经理审批节点', () => {
  const states = runOA(managerCtx, formData({ amount: 3000 }))

  it('amount 只读、不可编辑，但仍必填', () => {
    assert.equal(states.amount.readonly, true)
    assert.equal(states.amount.editable, false)
    assert.equal(states.amount.required, true)
  })

  it('审批意见对经理可见、必填、可编辑', () => {
    assert.equal(states.approveComment.visible, true)
    assert.equal(states.approveComment.required, true)
    assert.equal(states.approveComment.editable, true)
  })
})

describe('OA Runtime · 场景3：金额预警', () => {
  it('amount = 6000 > 5000：出现 warning', () => {
    const states = runOA(employeeCtx, formData({ amount: 6000 }))
    assert.equal(states.amount.warnings.length, 1)
    assert.match(states.amount.warnings[0], /发票/)
  })

  it('amount = 5000：无 warning（严格大于）', () => {
    const states = runOA(employeeCtx, formData({ amount: 5000 }))
    assert.deepEqual(states.amount.warnings, [])
  })

  it('经理节点 + 大额：只读与 warning 可同时存在（各层规则叠加）', () => {
    const states = runOA(managerCtx, formData({ amount: 8000 }))
    assert.equal(states.amount.readonly, true)
    assert.equal(states.amount.warnings.length, 1)
  })
})

describe('OA Runtime · 场景4：角色与实例权限', () => {
  it('后端下发只读实例（permissions.editable=false）：amount 禁用', () => {
    const readonlyCtx = createRuntimeContext({
      task: { node: 'employee_fill' },
      user: { roles: ['employee'] },
      permissions: { editable: false },
    })
    const states = runOA(readonlyCtx, formData({ amount: 1000 }))
    assert.equal(states.amount.disabled, true)
    assert.equal(states.amount.editable, false)
  })

  it('经理拥有 employee 之外的字段（审批意见），员工没有', () => {
    const employeeStates = runOA(employeeCtx, formData())
    const managerStates = runOA(managerCtx, formData())
    assert.equal(employeeStates.approveComment.visible, false)
    assert.equal(managerStates.approveComment.visible, true)
  })
})

describe('OA Runtime · ComponentMap / Renderer', () => {
  it('amount 的渲染配置：MoneyInput + 合并后的 props（precision/currency）', () => {
    const configs = buildRenderConfigs(schema)
    const amount = configs.find((c) => c.field === 'amount')!

    assert.equal(amount.componentName, 'MoneyInput')
    assert.equal(amount.props.precision, 2)
    assert.equal(amount.props.currency, 'CNY')
  })

  it('registeredCapital 只覆盖 precision，currency 取组件默认值', () => {
    const configs = buildRenderConfigs(schema)
    const capital = configs.find((c) => c.field === 'registeredCapital')!
    assert.equal(capital.props.precision, 2)
    assert.equal(capital.props.currency, 'CNY') // 来自默认 props
  })

  it('renderForm 产出真实 Vue VNode：员工节点 amount 可输入', () => {
    const states = runOA(employeeCtx, formData({ amount: 3000 }))
    const nodes = renderForm(schema, formData({ amount: 3000 }), states)

    const amountNode = nodes.find((n) => n.field === 'amount')!
    // VNode 的 type 就是 MoneyInput 组件定义
    assert.equal((amountNode.vnode.type as { name?: string }).name, 'MoneyInput')
    assert.equal(amountNode.vnode.props?.modelValue, 3000)
    assert.equal(amountNode.vnode.props?.readonly, false)
    assert.equal(amountNode.vnode.props?.disabled, false)

    // 审批意见不可见 → 不在渲染结果中
    assert.ok(!nodes.some((n) => n.field === 'approveComment'))
  })

  it('renderForm：经理节点 amount 的 VNode 带 readonly，审批意见被渲染', () => {
    const states = runOA(managerCtx, formData({ amount: 3000 }))
    const nodes = renderForm(schema, formData({ amount: 3000 }), states)

    const amountNode = nodes.find((n) => n.field === 'amount')!
    assert.equal(amountNode.vnode.props?.readonly, true)
    assert.ok(nodes.some((n) => n.field === 'approveComment'))
  })
})
