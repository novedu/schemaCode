import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { FormData } from '../../types'
import { SchemaRegistry } from '../schema-registry'
import { SchemaVersionResolver } from '../schema-version-resolver'
import { orderFormV1, orderFormV2 } from '../order-form-schemas'
import { buildDependencyGraph } from '../../dependency/dependency-graph'
import { RuleScheduler } from '../../scheduler/rule-scheduler'
import { warningRules } from '../../rules/warning-rules'
import { provideSchemaState } from '../../state-resolution/schema-state-provider'
import { provideRuleState } from '../../state-resolution/rule-state-provider'
import { provideBpmState } from '../../state-resolution/bpm-state-provider'
import { providePermissionState } from '../../state-resolution/permission-state-provider'
import { resolveFieldStates } from '../../state-resolution/field-state-resolver'
import { renderForm } from '../../renderer/renderer'
import { createRuntimeContext } from '../../runtime/runtime-context'

/** 构造一个只注册了 v1 的 Registry（用于版本冻结时序测试） */
function registryWithV1(): SchemaRegistry {
  const registry = new SchemaRegistry()
  registry.register('orderForm', 'v1', orderFormV1)
  return registry
}

/** 构造 v1/v2 都已注册的 Registry */
function registryWithBoth(): SchemaRegistry {
  const registry = registryWithV1()
  registry.register('orderForm', 'v2', orderFormV2)
  return registry
}

function orderData(amount = 6000): FormData {
  return {
    customerType: 'person',
    companyName: '',
    registeredCapital: 0,
    amount,
    approveComment: '',
  }
}

/* ═══════════════ 1. Registry：多版本并存 / 唯一注册 ═══════════════ */

describe('SchemaRegistry', () => {
  it('v1 与 v2 同时存在：两个版本都能严格按号取出', () => {
    const registry = registryWithBoth()

    assert.equal(registry.getSchema('orderForm', 'v1'), orderFormV1)
    assert.equal(registry.getSchema('orderForm', 'v2'), orderFormV2)
  })

  it('同一 formId + version 重复注册：拒绝并抛错', () => {
    const registry = registryWithV1()

    assert.throws(
      () => registry.register('orderForm', 'v1', orderFormV2),
      /重复注册/,
    )
  })

  it('listVersions 按版本号升序：v1 → v2', () => {
    const registry = registryWithBoth()
    assert.deepEqual(registry.listVersions('orderForm'), ['v1', 'v2'])
  })

  it('getLatestVersion：v2', () => {
    const registry = registryWithBoth()
    assert.equal(registry.getLatestVersion('orderForm'), 'v2')
  })

  it('读取不存在的版本：抛出明确错误并列出已注册版本', () => {
    const registry = registryWithBoth()

    assert.throws(
      () => registry.getSchema('orderForm', 'v9'),
      /版本不存在.*v1.*v2/s,
    )
  })

  it('读取未注册的表单：抛出明确错误', () => {
    const registry = new SchemaRegistry()

    assert.throws(
      () => registry.getSchema('notExist', 'v1'),
      /表单未在 Registry 中注册/,
    )
  })
})

/* ═══════════════ 2. VersionResolver：历史冻结 / 新建最新 ═══════════════ */

describe('SchemaVersionResolver', () => {
  it('历史任务指定 v1：即使 v2 已发布，也绝不加载 v2', () => {
    const resolver = new SchemaVersionResolver(registryWithBoth())

    const resolution = resolver.resolve({
      formId: 'orderForm',
      mode: 'history',
      version: 'v1',
    })

    assert.equal(resolution.version, 'v1')
    assert.equal(resolution.schema, orderFormV1)
    assert.equal(resolution.pinned, true)
  })

  it('历史任务缺少 version：拒绝打开（禁止隐式升级）', () => {
    const resolver = new SchemaVersionResolver(registryWithBoth())

    assert.throws(
      () => resolver.resolve({ formId: 'orderForm', mode: 'history' }),
      /历史任务缺少 schemaVersion/,
    )
  })

  it('新建表单：忽略入参 version，始终绑定 latest=v2', () => {
    const resolver = new SchemaVersionResolver(registryWithBoth())

    const resolution = resolver.resolve({
      formId: 'orderForm',
      mode: 'create',
      version: 'v1', // 即使误传也不采用
    })

    assert.equal(resolution.version, 'v2')
    assert.equal(resolution.schema, orderFormV2)
    assert.equal(resolution.pinned, false)
  })

  it('后端绑定：响应带 schemaVersion → 冻结历史版本', () => {
    const resolver = new SchemaVersionResolver(registryWithBoth())

    const resolution = resolver.bindBackendTask({
      taskId: '10001',
      formId: 'orderForm',
      schemaVersion: 'v1',
      data: { amount: 6000 },
    })

    assert.equal(resolution.version, 'v1')
    assert.equal(resolution.mode, 'history')
    assert.equal(resolution.pinned, true)
  })

  it('后端绑定：响应不带版本 → 新建，自动解析 latest', () => {
    const resolver = new SchemaVersionResolver(registryWithBoth())

    const resolution = resolver.bindBackendTask({
      taskId: '20001',
      formId: 'orderForm',
    })

    assert.equal(resolution.version, 'v2')
    assert.equal(resolution.mode, 'create')
  })
})

/* ═══════════════ 3. 版本冻结时序：创建 v1 → 发布 v2 → 重开仍 v1 ═══════════════ */

describe('版本冻结（Version Freeze）', () => {
  it('2026-01 用 v1 创建并持久化；2026-02 发布 v2；重新打开历史任务仍是 v1', () => {
    const registry = registryWithV1()
    const resolver = new SchemaVersionResolver(registry)

    // ① 创建时：latest 还是 v1，持久化绑定 {formId, schemaVersion:'v1'}
    const created = resolver.bindBackendTask({
      taskId: '10001',
      formId: 'orderForm',
    })
    const savedBinding = { formId: created.formId, schemaVersion: created.version }
    assert.equal(savedBinding.schemaVersion, 'v1')

    // ② 之后 v2 发布
    registry.register('orderForm', 'v2', orderFormV2)
    assert.equal(registry.getLatestVersion('orderForm'), 'v2')

    // ③ 重新打开历史任务：用持久化版本，拿到的仍是 v1
    const reopened = resolver.bindBackendTask({
      taskId: '10001',
      formId: savedBinding.formId,
      schemaVersion: savedBinding.schemaVersion,
    })

    assert.equal(reopened.version, 'v1')
    assert.equal(reopened.schema, orderFormV1)
    assert.notEqual(reopened.schema, orderFormV2)
  })
})

/* ═══════ 4. Pipeline 集成：解析出的 Schema 继续进入已有运行时 ═══════ */

describe('Schema Version → Existing Runtime Pipeline', () => {
  it('历史 v1 + amount=6000：Graph/Scheduler/StateResolver/Renderer 全部按 v1 工作', () => {
    const resolver = new SchemaVersionResolver(registryWithBoth())
    const { schema: schemaV1, version } = resolver.bindBackendTask({
      taskId: '10001',
      formId: 'orderForm',
      schemaVersion: 'v1',
    })
    assert.equal(version, 'v1')

    const data = orderData(6000)
    const ctx = createRuntimeContext({
      task: { taskId: '10001', node: 'employee_fill' },
      user: { roles: ['employee'] },
    })

    // ① DependencyGraph：amount → warning 规则
    const graph = buildDependencyGraph(warningRules)
    assert.equal(graph.getRulesDependingOn('amount').length, 1)

    // ② RuleScheduler（增量调度器不感知版本，只消费 Schema）
    const scheduler = new RuleScheduler(schemaV1, warningRules, graph)
    const scheduled = scheduler.schedule(data, ['amount'], ctx)
    assert.equal(scheduled.fieldStates.amount.visible, true)
    assert.equal(scheduled.fieldStates.amount.warnings.length, 1)

    // ③ StateResolver：四来源照常裁决（员工节点可编辑 + warning）
    const { fieldStates } = resolveFieldStates(schemaV1, [
      { name: 'schema', patches: provideSchemaState(schemaV1) },
      { name: 'rule', patches: provideRuleState(warningRules, data, ctx) },
      { name: 'bpm', patches: provideBpmState(ctx) },
      { name: 'permission', patches: providePermissionState(ctx) },
    ])
    assert.equal(fieldStates.amount.editable, true)
    assert.equal(fieldStates.amount.warnings.length, 1)

    // ④ Renderer：v1 页面只有 amount
    const nodes = renderForm(schemaV1, data, fieldStates)
    assert.deepEqual(nodes.map((n) => n.field), ['amount'])
    assert.equal(
      (nodes[0].vnode.type as { name?: string }).name,
      'NumberInput',
    )
  })

  it('新建 v2：页面渲染 amount + currency，组件与 v1 不同', () => {
    const resolver = new SchemaVersionResolver(registryWithBoth())
    const { schema: schemaV2 } = resolver.bindBackendTask({
      taskId: '20001',
      formId: 'orderForm',
    })

    const data = orderData(6000)
    const ctx = createRuntimeContext({
      task: { taskId: '20001', node: 'employee_fill' },
      user: { roles: ['employee'] },
    })

    const { fieldStates } = resolveFieldStates(schemaV2, [
      { name: 'schema', patches: provideSchemaState(schemaV2) },
      { name: 'rule', patches: provideRuleState(warningRules, data, ctx) },
      { name: 'bpm', patches: provideBpmState(ctx) },
      { name: 'permission', patches: providePermissionState(ctx) },
    ])

    const nodes = renderForm(schemaV2, data, fieldStates)
    assert.deepEqual(nodes.map((n) => n.field), ['amount', 'currency'])
    assert.equal(
      (nodes[0].vnode.type as { name?: string }).name,
      'MoneyInput',
    )
    // v2 的 amount 仍受 warning 规则约束（规则与版本解耦）
    assert.equal(fieldStates.amount.warnings.length, 1)
  })

  it('渲染层与规则层均无版本分支：同一套 warningRules 在两个版本下语义一致', () => {
    // 关键架构断言：版本选择发生在进入 Pipeline 之前；
    // Pipeline 内部没有任何 if (version === ...)，因此规则行为不随版本漂移
    const data6000 = orderData(6000)
    const data3000 = orderData(3000)

    for (const s of [orderFormV1, orderFormV2]) {
      const ctx = createRuntimeContext({ task: { node: 'employee_fill' }, user: { roles: ['employee'] } })

      // 两个数据集各自使用独立调度器 —— 增量调度器持久化状态，
      // 规则不再命中不会自动撤掉旧输出（这是增量语义，不是 bug）
      const graph = buildDependencyGraph(warningRules)

      const hit = new RuleScheduler(s, warningRules, graph)
        .schedule(data6000, ['amount'], ctx)
      assert.equal(hit.fieldStates.amount.warnings.length, 1)

      const miss = new RuleScheduler(s, warningRules, graph)
        .schedule(data3000, ['amount'], ctx)
      assert.deepEqual(miss.fieldStates.amount.warnings, [])
    }
  })
})
