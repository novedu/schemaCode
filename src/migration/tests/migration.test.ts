import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type {
  FieldSchema,
  FieldState,
  FormData,
  FieldShapeNode,
  RuntimeContext,
  Schema,
} from '../../types'
import { defaultFieldState } from '../../engine/field-state'
import { createRuntimeContext } from '../../runtime/runtime-context'
import { validateMigrationPlan } from '../migration-validator'
import { MigrationRegistry } from '../migration-registry'
import type {
  MigrationPlan,
  MigrationReport,
  MigrationValidationInput,
} from '../types'
import {
  migrationSampleData,
  orderMigrationPlan,
  migrationOrderV1,
  migrationOrderV2,
} from '../demo/order-migration-schemas'

/* ── 夹具：可定制的 v1 / 对象式 v2 ── */

function v1Schema(props?: Record<string, unknown>): Schema {
  return {
    fields: [
      {
        name: 'amount',
        label: '金额',
        type: 'number',
        props,
        initialState: defaultFieldState({ required: true }),
      },
    ],
  }
}

function v2ObjectSchema(options: {
  currencyRequired?: boolean
  valuePrecision?: number
  extraFields?: { name: string; type: FieldShapeNode['type']; required?: boolean }[]
} = {}): Schema {
  const shape: Record<string, FieldShapeNode> = {
    value: {
      type: 'number',
      required: true,
      precision: options.valuePrecision ?? 2,
    },
    currency: { type: 'string', required: options.currencyRequired ?? false },
  }

  const fields: FieldSchema[] = [
    {
      name: 'amount',
      label: '金额',
      type: 'object',
      shape,
      initialState: defaultFieldState({ required: true }),
    },
  ]

  for (const extra of options.extraFields ?? []) {
    fields.push({
      name: extra.name,
      label: extra.name,
      type: 'text' as const,
      initialState: defaultFieldState({ required: extra.required ?? false }),
    })
  }

  return { fields }
}

function plan(overrides: Partial<MigrationPlan> = {}): MigrationPlan {
  return {
    formId: 'orderForm',
    fromVersion: 'v1',
    toVersion: 'v2',
    fieldMappings: [
      { source: 'amount', target: 'amount.value', transform: 'numberToMoney' },
    ],
    defaults: [],
    ...overrides,
  }
}

function sampleData(amount = 6000): FormData {
  return {
    customerType: 'person',
    companyName: '',
    registeredCapital: 0,
    amount,
    approveComment: '',
  }
}

function runWith(
  plan: MigrationPlan,
  schemas: { source: Schema; target: Schema },
  permissionConfiguredFields: string[] = [],
  context?: RuntimeContext,
): MigrationReport {
  const ctx = context ?? createRuntimeContext({
    task: { taskId: '10001', node: 'employee_fill' },
    user: { roles: ['employee'] },
  })

  const input: MigrationValidationInput = {
    sourceSchema: schemas.source,
    targetSchema: schemas.target,
    sampleData: sampleData(),
    context: ctx,
    permissionConfiguredFields,
  }

  return validateMigrationPlan(plan, input)
}

function checkNamed(report: MigrationReport, name: string) {
  const check = report.checks.find((c) => c.name === name)
  assert.ok(check, `缺少检查项: ${name}`)
  return check
}

/* ═══════════════════ 七个必选案例 ═══════════════════ */

describe('Migration Validation · 案例1', () => {
  it('number → amount.value(number)：字段映射与类型检查 PASS，整体 success', () => {
    // currency 可选、无精度收窄 → 无任何风险项
    const report = runWith(
      plan(),
      { source: v1Schema(), target: v2ObjectSchema() },
    )

    assert.equal(checkNamed(report, 'field mapping').status, 'pass')
    assert.equal(checkNamed(report, 'type').status, 'pass')
    assert.equal(checkNamed(report, 'required').status, 'pass')
    assert.equal(report.status, 'success')
    assert.deepEqual(report.errors, [])
  })
})

describe('Migration Validation · 案例2', () => {
  it('新增必填 currency 且 defaults 提供 CNY：required 检查 PASS', () => {
    const report = runWith(
      plan({
        defaults: [{ field: 'amount.currency', value: 'CNY' }],
      }),
      {
        source: v1Schema(),
        target: v2ObjectSchema({ currencyRequired: true }),
      },
    )

    assert.equal(checkNamed(report, 'required').status, 'pass')
    assert.deepEqual(report.manualRequired, [])
  })
})

describe('Migration Validation · 案例3', () => {
  it('新增必填 currency 但无 default：manualRequired', () => {
    const report = runWith(
      plan(),
      {
        source: v1Schema(),
        target: v2ObjectSchema({ currencyRequired: true }),
      },
    )

    assert.equal(checkNamed(report, 'required').status, 'manual')
    assert.equal(report.manualRequired.length, 1)
    assert.match(report.manualRequired[0], /amount\.currency.*manual value/)
  })
})

describe('Migration Validation · 案例4', () => {
  it('source 字段不存在：error "source field price not found"', () => {
    const report = runWith(
      plan({
        fieldMappings: [
          { source: 'price', target: 'amount.value', transform: 'numberToMoney' },
        ],
      }),
      { source: v1Schema(), target: v2ObjectSchema() },
    )

    assert.equal(checkNamed(report, 'field mapping').status, 'fail')
    assert.equal(report.status, 'error')
    assert.ok(report.errors.some((m) => /source field price not found/.test(m)))
  })

  it('object → number 不可转换：type 检查 fail', () => {
    // 源端 amount 为 object，目标叶子为 number
    const objectSource: Schema = {
      fields: [
        {
          name: 'amount',
          label: '金额',
          type: 'object',
          shape: { x: { type: 'number' } },
          initialState: defaultFieldState(),
        },
      ],
    }

    const report = runWith(
      plan(),
      { source: objectSource, target: v2ObjectSchema() },
    )

    assert.equal(checkNamed(report, 'type').status, 'fail')
    assert.ok(report.errors.some((m) => /incompatible type change/.test(m)))
  })
})

describe('Migration Validation · 案例5', () => {
  it('精度降低 4 → 2：warning "precision reduction detected"', () => {
    const report = runWith(
      plan(),
      {
        source: v1Schema({ precision: 4 }),
        target: v2ObjectSchema({ valuePrecision: 2 }),
      },
    )

    assert.equal(checkNamed(report, 'precision').status, 'warning')
    assert.equal(report.status, 'warning')
    assert.ok(report.warnings.some((m) => /precision reduction detected/.test(m)))
  })
})

describe('Migration Validation · 案例6', () => {
  it('新增字段 approvalReason 无权限策略：manualRequired', () => {
    const report = runWith(
      plan(),
      {
        source: v1Schema(),
        target: v2ObjectSchema({
          extraFields: [{ name: 'approvalReason', type: 'string' }],
        }),
      },
      // amount 是老字段；approvalReason 未登记权限
      ['amount'],
    )

    assert.equal(checkNamed(report, 'permission').status, 'manual')
    assert.ok(
      report.manualRequired.some((m) => /approvalReason.*permission policy/.test(m)),
    )
  })

  it('新增字段已登记权限策略：permission 检查 PASS', () => {
    const report = runWith(
      plan(),
      {
        source: v1Schema(),
        target: v2ObjectSchema({
          extraFields: [{ name: 'approvalReason', type: 'string' }],
        }),
      },
      ['amount', 'approvalReason'],
    )

    assert.equal(checkNamed(report, 'permission').status, 'pass')
  })
})

describe('MigrationRegistry · 案例7', () => {
  it('同一路径重复注册：fail fast', () => {
    const registry = new MigrationRegistry()
    registry.register(orderMigrationPlan)

    assert.throws(
      () => registry.register(orderMigrationPlan),
      /路径重复注册/,
    )
  })

  it('查询不存在的路径：抛出明确错误并列出已注册路径', () => {
    const registry = new MigrationRegistry()
    registry.register(orderMigrationPlan)

    assert.throws(
      () => registry.getMigration('orderForm', 'v2', 'v3'),
      /路径不存在.*v1 → v2/s,
    )
  })

  it('注册后可严格取回', () => {
    const registry = new MigrationRegistry()
    registry.register(orderMigrationPlan)
    assert.equal(
      registry.getMigration('orderForm', 'v1', 'v2'),
      orderMigrationPlan,
    )
  })
})

/* ═════════ 完整 Demo 链路：报告可审计 + 数据不被修改 ═════════ */

describe('Migration Demo · 完整报告', () => {
  it('v1 amount(precision4) → v2 {value,currency}：映射/默认值 PASS，精度 warning', () => {
    const ctx = createRuntimeContext({
      task: { taskId: '10001', node: 'employee_fill' },
      user: { roles: ['employee'] },
    })

    const report = validateMigrationPlan(orderMigrationPlan, {
      sourceSchema: migrationOrderV1,
      targetSchema: migrationOrderV2,
      sampleData: migrationSampleData,
      context: ctx,
      permissionConfiguredFields: [],
    })

    assert.equal(checkNamed(report, 'field mapping').status, 'pass')
    assert.equal(checkNamed(report, 'type').status, 'pass')
    assert.equal(checkNamed(report, 'required').status, 'pass')
    assert.equal(checkNamed(report, 'precision').status, 'warning')
    assert.equal(checkNamed(report, 'permission').status, 'pass')
    assert.equal(report.status, 'warning')
  })

  it('校验是只读旁路：样本数据与计划均保持原样', () => {
    const before = JSON.stringify(migrationSampleData)

    validateMigrationPlan(orderMigrationPlan, {
      sourceSchema: migrationOrderV1,
      targetSchema: migrationOrderV2,
      sampleData: migrationSampleData,
      context: createRuntimeContext(),
      permissionConfiguredFields: [],
    })

    assert.equal(JSON.stringify(migrationSampleData), before)
    assert.equal(migrationSampleData.amount, 6000)
    assert.equal(orderMigrationPlan.fieldMappings.length, 1)
  })
})
