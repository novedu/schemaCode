import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { FormData } from '../../../types'
import type {
  MigrationPlan,
  MigrationReport,
} from '../../types'
import { MigrationExecutor } from '../migration-executor'
import { TransformRegistry } from '../transform-registry'
import { ExecutionMetaStore } from '../execution-meta-store'
import { validateMigrationPlan } from '../../migration-validator'
import {
  migrationOrderV1,
  migrationOrderV2,
  orderMigrationPlan,
} from '../../demo/order-migration-schemas'
import { createRuntimeContext } from '../../../runtime/runtime-context'

/* ── 夹具 ── */

function formData(overrides: Partial<FormData> = {}): FormData {
  return {
    customerType: 'person',
    companyName: '',
    registeredCapital: 0,
    amount: 6000,
    approveComment: '',
    ...overrides,
  }
}

/** 构造一个指定状态的校验报告（用于精确控制执行门禁） */
function validationResult(
  status: MigrationReport['status'],
  extra: Partial<MigrationReport> = {},
): MigrationReport {
  return {
    formId: 'orderForm',
    fromVersion: 'v1',
    toVersion: 'v2',
    status,
    checks: [],
    errors: status === 'error' ? ['blocked'] : [],
    warnings: status === 'warning' ? ['some risk'] : [],
    manualRequired: [],
    ...extra,
  }
}

/** copy 计划：companyName → companyName */
const copyPlan: MigrationPlan = {
  formId: 'orderForm',
  fromVersion: 'v1',
  toVersion: 'v2',
  fieldMappings: [
    { source: 'companyName', target: 'companyName', transform: 'identity' },
  ],
  defaults: [],
}

/** default 计划：给 amount.currency 填默认值 */
const defaultPlan: MigrationPlan = {
  formId: 'orderForm',
  fromVersion: 'v1',
  toVersion: 'v2',
  fieldMappings: [],
  defaults: [{ field: 'amount.currency', value: 'CNY' }],
}

/* ═══════════════ 九个必选测试 ═══════════════ */

describe('MigrationExecutor', () => {
  it('1. field copy 成功：值原样搬运', () => {
    const executor = new MigrationExecutor()
    const data = formData({ companyName: 'Tom' })

    const report = executor.execute(
      copyPlan,
      validationResult('success'),
      data,
      { dryRun: false },
    )

    assert.equal(report.status, 'success')
    assert.equal(report.migratedData!.companyName, 'Tom')
  })

  it('2. default value 成功：按 Plan 声明写入', () => {
    const executor = new MigrationExecutor()

    const report = executor.execute(
      defaultPlan,
      validationResult('success'),
      formData(),
      { dryRun: false },
    )

    assert.equal(report.status, 'success')
    assert.deepEqual(report.migratedData!.amount, { currency: 'CNY' })
  })

  it('3. transform number → money 成功：amount 变成 {value,currency}', () => {
    const executor = new MigrationExecutor()

    // 使用真实校验报告（warning：精度收窄；不阻塞执行）
    const validation = validateMigrationPlan(orderMigrationPlan, {
      sourceSchema: migrationOrderV1,
      targetSchema: migrationOrderV2,
      sampleData: formData(),
      context: createRuntimeContext(),
      permissionConfiguredFields: [],
    })

    const report = executor.execute(
      orderMigrationPlan,
      validation,
      formData({ amount: 6000 }),
      { dryRun: false },
    )

    assert.equal(report.status, 'success')
    assert.deepEqual(report.migratedData!.amount, {
      value: 6000,
      currency: 'CNY',
    })
    // 校验阶段的风险提示被继承到执行报告
    assert.equal(report.warnings.length, 1)
  })

  it('4. operation log 完整：transform + default 两条，含 action/before/after/时间戳', () => {
    const executor = new MigrationExecutor()

    const report = executor.execute(
      orderMigrationPlan,
      validationResult('success'),
      formData({ amount: 6000 }),
      { dryRun: false },
    )

    assert.equal(report.operations!.length, 2)

    const transformLog = report.operations!.find((o) => o.action === 'transform')!
    assert.equal(transformLog.sourceField, 'amount')
    assert.equal(transformLog.targetField, 'amount.value')
    assert.equal(transformLog.before, 6000)
    assert.equal(transformLog.after, 6000)
    assert.ok(transformLog.timestamp > 0)

    const defaultLog = report.operations!.find((o) => o.action === 'default')!
    assert.equal(defaultLog.targetField, 'amount.currency')
    assert.equal(defaultLog.after, 'CNY')
  })

  it('5. dryRun：输入对象不被修改（默认就是 dryRun=true）', () => {
    const executor = new MigrationExecutor()
    const input = formData({ amount: 6000 })
    const snapshot = JSON.stringify(input)

    const report = executor.execute(
      orderMigrationPlan,
      validationResult('success'),
      input,
    ) // 不传 dryRun → 默认 true

    assert.equal(report.dryRun, true)
    assert.equal(JSON.stringify(input), snapshot) // 输入原样
    assert.equal(input.amount, 6000)
    // 预览数据照常生成
    assert.deepEqual(report.migratedData!.amount, {
      value: 6000,
      currency: 'CNY',
    })
  })

  it('6. transform 失败：不 throw，生成 failure report（单条 failed）', () => {
    const registry = new TransformRegistry()
    registry.register('boom', () => {
      throw new Error('transform failed')
    })
    const executor = new MigrationExecutor(registry)

    const badPlan: MigrationPlan = {
      formId: 'orderForm',
      fromVersion: 'v1',
      toVersion: 'v2',
      fieldMappings: [
        { source: 'amount', target: 'amount.value', transform: 'boom' },
      ],
      defaults: [],
    }

    const report = executor.execute(
      badPlan,
      validationResult('success'),
      formData(),
      { dryRun: false },
    )

    assert.equal(report.status, 'failed')
    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0].reason, /transform failed/)
    assert.equal(report.failures[0].field, 'amount.value')
  })

  it('7. 批量部分成功：3 条中第 2 条失败 → partial，且其余两条正常', () => {
    const executor = new MigrationExecutor()

    const records = [
      formData({ amount: 1000 }),
      formData({ amount: undefined as unknown as number }), // numberToMoney 抛错
      formData({ amount: 3000 }),
    ]

    const report = executor.executeBatch(
      orderMigrationPlan,
      validationResult('success'),
      records,
      { dryRun: false },
    )

    assert.equal(report.status, 'partial')
    assert.equal(report.failures.length, 1)
    assert.equal(report.failures[0].index, 1)
    assert.equal(report.items!.length, 3)

    assert.equal(report.items![0].status, 'success')
    assert.deepEqual(report.items![0].data.amount, {
      value: 1000,
      currency: 'CNY',
    })
    assert.equal(report.items![1].status, 'failed')
    assert.equal(report.items![2].status, 'success')

    // 失败记录的输入未被污染
    assert.equal(records[1].amount, undefined)
  })

  it('8. 重复执行检测：成功后再次执行 → alreadyExecuted，不重复转换', () => {
    const executor = new MigrationExecutor()
    const validation = validationResult('success')

    const first = executor.execute(
      orderMigrationPlan,
      validation,
      formData({ amount: 6000 }),
      { dryRun: false },
    )
    assert.equal(first.status, 'success')

    const second = executor.execute(
      orderMigrationPlan,
      validation,
      formData({ amount: 9999 }),
      { dryRun: false },
    )
    assert.equal(second.status, 'alreadyExecuted')
    assert.equal(second.migratedData, undefined)
    assert.deepEqual(second.failures, [])
  })

  it('8b. partial 不标记已执行：修复后允许重试', () => {
    const executor = new MigrationExecutor()

    const partial = executor.executeBatch(
      orderMigrationPlan,
      validationResult('success'),
      [formData({ amount: 100 }), formData({ amount: undefined as unknown as number })],
      { dryRun: false },
    )
    assert.equal(partial.status, 'partial')

    const retry = executor.executeBatch(
      orderMigrationPlan,
      validationResult('success'),
      [formData({ amount: 100 }), formData({ amount: 200 })],
      { dryRun: false },
    )
    assert.equal(retry.status, 'success')
  })

  it('9. Validation 不通过（error）：禁止执行，无数据产出', () => {
    const executor = new MigrationExecutor()

    const report = executor.execute(
      orderMigrationPlan,
      validationResult('error', { errors: ['source field x not found'] }),
      formData({ amount: 6000 }),
      { dryRun: false },
    )

    assert.equal(report.status, 'failed')
    assert.equal(report.migratedData, undefined)
    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0].reason, /validation 未通过/)
  })
})

describe('MigrationExecutor · 幂等元数据独立存储', () => {
  it('不同 MetaStore 的执行器互不影响', () => {
    const executorA = new MigrationExecutor(undefined, new ExecutionMetaStore())
    const executorB = new MigrationExecutor(undefined, new ExecutionMetaStore())

    executorA.execute(
      orderMigrationPlan,
      validationResult('success'),
      formData(),
      { dryRun: false },
    )

    const reportB = executorB.execute(
      orderMigrationPlan,
      validationResult('success'),
      formData(),
      { dryRun: false },
    )
    assert.equal(reportB.status, 'success')
  })
})
