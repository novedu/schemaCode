import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type {
  FieldStatePatch,
  RuntimeContext,
  Schema,
  StatePatchMap,
} from '@runtime-core/types'
import { resolveFieldStates } from '@runtime-core/state-resolution/field-state-resolver'
import { provideSchemaState } from '@runtime-core/state-resolution/schema-state-provider'
import {
  createPermissionDoc,
  setPermissionState,
  type PermissionDoc,
} from '../permission-model'
import {
  buildPermissionConfig,
  permissionConfigToDoc,
  validatePermissionDoc,
  type PermissionConfig,
} from '../permission-builder'

/* ── 联调夹具 ── */

const scenarioSchema: Schema = {
  fields: [
    {
      name: 'amount',
      label: '报销金额',
      type: 'money',
      initialState: {
        visible: true,
        required: true,
        disabled: false,
        readonly: false,
        editable: true,
        warnings: [],
      },
    },
  ],
}

/** 按需求构造的权限文档 */
function scenarioDoc(): PermissionDoc {
  let doc = createPermissionDoc()
  doc.entries = setPermissionState([], 'amount', 'employee', 'editable', true)
  doc.entries = setPermissionState(doc.entries, 'amount', 'manager', 'readonly', true)
  doc.entries = setPermissionState(doc.entries, 'amount', 'finance', 'editable', true)
  return doc
}

/** 模拟 demo-app 适配器：配置 + 角色 → 补丁表（声明式查表） */
function adapterPatches(config: PermissionConfig, roles: string[]): StatePatchMap {
  const set = new Set(roles)
  const result: StatePatchMap = {}
  for (const entry of config.entries) {
    if (!set.has(entry.role)) continue
    result[entry.field] = {
      ...result[entry.field],
      ...(entry.patch as FieldStatePatch),
    }
  }
  return result
}

function contextFor(role: string): RuntimeContext {
  return {
    schemaVersion: 'v1',
    task: { taskId: 't1', node: `${role}_node` },
    user: { roles: [role] },
    permissions: { editable: true },
  }
}

describe('permission-builder · 产物结构一致性', () => {
  it('permission.json：版本/角色/条目齐全；条目无编辑 id，patch 稀疏', () => {
    const config = buildPermissionConfig(scenarioDoc())

    assert.equal(config.version, 1)
    assert.deepEqual(config.roles, ['employee', 'manager', 'finance'])
    assert.equal(config.entries.length, 3)

    const managerEntry = config.entries.find((e) => e.role === 'manager')
    assert.deepEqual(managerEntry, {
      field: 'amount',
      role: 'manager',
      patch: { readonly: true },
    })
    assert.equal('id' in (managerEntry as Record<string, unknown>), false)
  })

  it('JSON 序列化往返（模拟导出文件再加载）结构不变', () => {
    const config = buildPermissionConfig(scenarioDoc())
    const reloaded = JSON.parse(JSON.stringify(config)) as PermissionConfig

    assert.deepEqual(reloaded, config)
  })
})

describe('permission-builder · Runtime 执行结果一致（核心 FieldStateResolver）', () => {
  // 按"导出文件"方式往返，确保执行的是文件产物而非内存对象
  const config = JSON.parse(
    JSON.stringify(buildPermissionConfig(scenarioDoc())),
  ) as PermissionConfig

  function resolve(role: string) {
    const ctx = contextFor(role)
    const sources = [
      { name: 'schema' as const, patches: provideSchemaState(scenarioSchema) },
      { name: 'permission' as const, patches: adapterPatches(config, [role]) },
    ]
    return resolveFieldStates(scenarioSchema, sources, { trace: true })
  }

  it('员工节点：amount 可编辑', () => {
    const { fieldStates } = resolve('employee')
    assert.equal(fieldStates.amount.editable, true)
    assert.equal(fieldStates.amount.readonly, false)
  })

  it('经理节点：amount 只读；Resolver 规范化出 editable=false', () => {
    const { fieldStates, traces } = resolve('manager')

    assert.equal(fieldStates.amount.readonly, true)
    // 补丁只写了 readonly，editable:false 是核心规范化结论，不是设计器写的
    assert.equal(fieldStates.amount.editable, false)
    // 决策来源可追溯到 permission
    assert.equal(traces[0].decidedBy.readonly, 'permission')
  })

  it('财务节点：amount 可编辑；角色切换结论翻转', () => {
    const finance = resolve('finance')
    const manager = resolve('manager')

    assert.equal(finance.fieldStates.amount.editable, true)
    assert.notEqual(
      finance.fieldStates.amount.readonly,
      manager.fieldStates.amount.readonly,
    )
  })
})

describe('permission-builder · 导出前校验', () => {
  it('完整文档通过校验', () => {
    assert.equal(validatePermissionDoc(scenarioDoc()).valid, true)
  })

  it('空补丁 / 非法值 / 角色缺失 被拦截', () => {
    const emptyPatch = createPermissionDoc()
    emptyPatch.entries = [
      { id: 'a', field: 'amount', role: 'manager', patch: {} },
    ]

    const badValue = createPermissionDoc()
    badValue.entries = [
      {
        id: 'b',
        field: 'amount',
        role: 'manager',
        // 校验器职责：非布尔值不允许（故意构造绕过类型）
        patch: { readonly: 'true' as unknown as boolean },
      },
    ]

    const missingRole = createPermissionDoc()
    missingRole.entries = [
      { id: 'c', field: 'amount', role: 'ghost', patch: { visible: true } },
    ]

    assert.equal(validatePermissionDoc(emptyPatch).valid, false)
    assert.equal(validatePermissionDoc(badValue).valid, false)
    assert.equal(validatePermissionDoc(missingRole).valid, false)
  })
})

describe('permission-builder · 反向解析（导入继续设计）', () => {
  it('permission.json → 文档：条目与角色保留，预置角色自动补齐', () => {
    const config: PermissionConfig = {
      version: 1,
      roles: ['auditor'],
      entries: [
        { field: 'amount', role: 'auditor', patch: { disabled: true } },
      ],
    }

    const doc = permissionConfigToDoc(config)
    assert.deepEqual(doc.roles, ['employee', 'manager', 'finance', 'auditor'])
    assert.equal(doc.entries[0].field, 'amount')
    assert.equal('id' in doc.entries[0], true)
  })

  it('结构非法时抛错', () => {
    assert.throws(() => permissionConfigToDoc({} as PermissionConfig))
  })
})
