import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { defaultFieldState } from '../../src/engine/field-state'
import type {
  FormData,
  RuntimeContext,
  Schema,
  StatePatchMap,
} from '../../src/types'
import { resolveFieldStates } from '../../src/state-resolution/field-state-resolver'
import { provideSchemaState } from '../../src/state-resolution/schema-state-provider'
import { provideRuleState } from '../../src/state-resolution/rule-state-provider'
import { provideBpmState } from '../../src/state-resolution/bpm-state-provider'
import { providePermissionState } from '../../src/state-resolution/permission-state-provider'
import { ConfigStore } from '../config-store'
import { FormService } from '../form-service'
import {
  PublishRequiresDraftError,
  PublishService,
} from '../publish-service'
import {
  DefinitionNotFoundError,
  type FormBundle,
  type FormDefinition,
  type PermissionConfig,
} from '../types'

/* ─────────────────────── 场景夹具（与设计器产物同构） ─────────────────────── */

/**
 * 构造采购单 Bundle：
 *   schema  = customerType(select) + amount(money)
 *   rules   = 空（本场景验证权限来源）
 *   perms   = amount 三角色稀疏权限
 *
 * precision 参数用于版本隔离用例（v1=2，v2=4）。
 */
function purchaseOrderBundle(precision: number): FormBundle {
  const schema: Schema = {
    fields: [
      {
        name: 'customerType',
        label: '客户类型',
        type: 'select',
        component: 'SelectInput',
        options: [
          { label: '个人', value: 'person' },
          { label: '公司', value: 'company' },
        ],
        initialState: defaultFieldState({ required: true }),
      },
      {
        name: 'amount',
        label: '报销金额',
        type: 'money',
        component: 'MoneyInput',
        props: { precision, currency: 'CNY' },
        initialState: defaultFieldState({ required: true }),
      },
    ],
  }

  const permissions: PermissionConfig = {
    version: 1,
    roles: ['employee', 'manager', 'finance'],
    entries: [
      { field: 'amount', role: 'employee', patch: { editable: true } },
      { field: 'amount', role: 'manager', patch: { readonly: true } },
      { field: 'amount', role: 'finance', patch: { editable: true } },
    ],
  }

  return { schema, rules: [], permissions }
}

/* ─────────────────────── demo-app 适配器（在测试中原样复现其装配） ─────────────────────── */

/** 应用侧网关读取：只允许 published；找不到抛 DefinitionNotFoundError */
function loadFormDefinition(
  forms: FormService,
  formId: string,
  version?: number,
): FormDefinition {
  const def =
    version === undefined
      ? forms.getLatestPublished(formId)
      : forms.getPublished(formId, version)

  if (!def) throw new DefinitionNotFoundError(formId, version)
  return def
}

/** permission.json 查表（与 demo-adapter / 应用侧实现逐行一致） */
function selectConfigPermissionPatches(
  config: PermissionConfig,
  roles: string[],
): StatePatchMap {
  const roleSet = new Set(roles)
  const result: StatePatchMap = {}
  for (const entry of config.entries) {
    if (!roleSet.has(entry.role)) continue
    result[entry.field] = { ...result[entry.field], ...entry.patch }
  }
  return result
}

function mergePatchMaps(a: StatePatchMap, b: StatePatchMap): StatePatchMap {
  const result = { ...a }
  for (const [field, patch] of Object.entries(b)) {
    result[field] = { ...result[field], ...patch }
  }
  return result
}

/**
 * 完整复刻 demo-app 的 recompute：
 * 配置 → 四来源（核心权限 + permission.json 补丁）→ 核心 Resolver
 * 页面自身不写 if(role)，状态全部来自 Resolver。
 */
function runtimeResolve(def: FormDefinition, role: string) {
  const ctx: RuntimeContext = {
    schemaVersion: 'v1',
    schema: { formId: def.formId, version: `v${def.version}` },
    // 使用核心 BPM 表不认识的节点名，让 BPM 来源 {}，
    // 保证 amount 结论唯一归因于 permission.json
    task: { taskId: `t_${role}`, node: `${role}_node` },
    user: { roles: [role] },
    permissions: { editable: true },
  }

  const data = { customerType: 'person' } as unknown as FormData
  const configPatches = selectConfigPermissionPatches(def.permissions, [role])
  const permissionPatches = mergePatchMaps(
    providePermissionState(ctx),
    configPatches,
  )

  const sources = [
    { name: 'schema' as const, patches: provideSchemaState(def.schema) },
    { name: 'rule' as const, patches: provideRuleState(def.rules, data, ctx) },
    { name: 'bpm' as const, patches: provideBpmState(ctx) },
    { name: 'permission' as const, patches: permissionPatches },
  ]

  return resolveFieldStates(def.schema, sources, { trace: true })
}

/* ─────────────────────── 生命周期测试 ─────────────────────── */

describe('PublishService · Case 1-4：Draft → Publish → Runtime Load', () => {
  it('Case 1：保存草稿后可查询到 status=draft', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)

    forms.saveDraft('purchase-order', 1, purchaseOrderBundle(2))
    assert.equal(forms.getDraft('purchase-order', 1)?.status, 'draft')
  })

  it('Case 2：Runtime 不能读取 draft（抛 DefinitionNotFoundError）', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)
    forms.saveDraft('purchase-order', 1, purchaseOrderBundle(2))

    assert.throws(
      () => loadFormDefinition(forms, 'purchase-order', 1),
      DefinitionNotFoundError,
    )
    assert.throws(
      () => loadFormDefinition(forms, 'purchase-order'),
      DefinitionNotFoundError,
    )
  })

  it('Case 3：publish 后状态变为 published；Case 4：Runtime 成功加载', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)
    const publish = new PublishService(forms, store)

    forms.saveDraft('purchase-order', 1, purchaseOrderBundle(2))
    const published = publish.publish('purchase-order', 1)

    assert.equal(published.status, 'published')
    assert.equal(forms.getDraft('purchase-order', 1), undefined)

    const loaded = loadFormDefinition(forms, 'purchase-order', 1)
    assert.equal(loaded.status, 'published')
    assert.equal(loadFormDefinition(forms, 'purchase-order').version, 1)
  })

  it('发布前置条件：无草稿 / 已发布 均不能 publish', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)
    const publish = new PublishService(forms, store)

    assert.throws(
      () => publish.publish('purchase-order', 1),
      PublishRequiresDraftError,
    )

    forms.saveDraft('purchase-order', 1, purchaseOrderBundle(2))
    publish.publish('purchase-order', 1)
    assert.throws(
      () => publish.publish('purchase-order', 1),
      PublishRequiresDraftError,
    )
  })
})

/* ─────────────────────── Runtime 行为测试 ─────────────────────── */

describe('PublishService · Case 5：Runtime 行为与浏览器实测一致', () => {
  const store = new ConfigStore()
  const forms = new FormService(store)
  const publish = new PublishService(forms, store)
  forms.saveDraft('purchase-order', 1, purchaseOrderBundle(2))
  publish.publish('purchase-order', 1)
  const def = loadFormDefinition(forms, 'purchase-order', 1)

  it('employee → amount editable=true / readonly=false', () => {
    const { fieldStates } = runtimeResolve(def, 'employee')
    assert.equal(fieldStates.amount.editable, true)
    assert.equal(fieldStates.amount.readonly, false)
  })

  it('manager → amount readonly=true；editable=false 由核心规范化得出', () => {
    const { fieldStates, traces } = runtimeResolve(def, 'manager')

    assert.equal(fieldStates.amount.readonly, true)
    assert.equal(fieldStates.amount.editable, false)

    const trace = traces.find((t) => t.field === 'amount')
    assert.equal(trace?.decidedBy.readonly, 'permission')
  })

  it('finance → amount editable=true；角色切换结论翻转', () => {
    const finance = runtimeResolve(def, 'finance')
    const manager = runtimeResolve(def, 'manager')

    assert.equal(finance.fieldStates.amount.editable, true)
    assert.notEqual(
      finance.fieldStates.amount.readonly,
      manager.fieldStates.amount.readonly,
    )
  })
})

/* ─────────────────────── 版本隔离测试 ─────────────────────── */

describe('PublishService · Case 6：版本隔离', () => {
  it('v1 发布后不被 v2 草稿/发布修改；两版本 Runtime 各自独立', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)
    const publish = new PublishService(forms, store)

    // v1: precision=2，发布
    forms.saveDraft('purchase-order', 1, purchaseOrderBundle(2))
    publish.publish('purchase-order', 1)

    // v2: precision=4，先是草稿
    forms.saveDraft('purchase-order', 2, purchaseOrderBundle(4))

    // v1 完全不受影响
    const v1DuringV2Draft = loadFormDefinition(forms, 'purchase-order', 1)
    assert.equal(v1DuringV2Draft.schema.fields[1].props?.precision, 2)

    // 发布 v2
    publish.publish('purchase-order', 2)

    const v1 = loadFormDefinition(forms, 'purchase-order', 1)
    const v2 = loadFormDefinition(forms, 'purchase-order', 2)

    assert.equal(v1.status, 'published')
    assert.equal(v1.schema.fields[1].props?.precision, 2)
    assert.equal(v2.schema.fields[1].props?.precision, 4)

    // 最新发布 = v2；显式请求 v1 仍然得到 v1
    assert.equal(loadFormDefinition(forms, 'purchase-order').version, 2)
    assert.equal(
      loadFormDefinition(forms, 'purchase-order', 1).schema.fields[1].props
        ?.precision,
      2,
    )
  })
})
