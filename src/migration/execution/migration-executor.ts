import type { FormData } from '../../types'
import type { MigrationReport, MigrationPlan } from '../types'
import {
  createDefaultTransformRegistry,
  TransformRegistry,
} from './transform-registry'
import { ExecutionMetaStore } from './execution-meta-store'
import { deepClone } from './data-path'
import { executeFieldCopy } from './strategies/field-copy'
import { executeDefaultValue } from './strategies/default-value'
import { executeTransform } from './strategies/transform'
import type { StrategyContext } from './strategies/strategy-types'
import type {
  BatchItemResult,
  ExecutionOptions,
  ExecutionReport,
  FailureEntry,
  OperationLogEntry,
} from './types'

/**
 * MigrationExecutor（迁移执行模拟器）
 *
 * 链路中的最后一环（经人工批准后才调用）：
 *
 *   Plan → Validation → Report → Human Approval → 本执行器（内存模拟）
 *
 * 关键行为：
 *   1. 校验门禁：ValidationReport.status==='error' 时禁止执行；
 *   2. 幂等保护：同一 migrationId 已成功执行 → 返回 alreadyExecuted，不重复转换；
 *   3. 永不 throw：单个字段/单条数据失败只记录 failure 并继续，
 *      最终按成功比例给出 success / partial / failed；
 *   4. 默认 dryRun=true：只产出预览数据与日志；
 *   5. 输入数据全程只读，所有操作发生在深克隆上。
 */
export class MigrationExecutor {
  private readonly transforms: TransformRegistry
  private readonly metaStore: ExecutionMetaStore

  constructor(
    transforms: TransformRegistry = createDefaultTransformRegistry(),
    metaStore: ExecutionMetaStore = new ExecutionMetaStore(),
  ) {
    this.transforms = transforms
    this.metaStore = metaStore
  }

  /** 执行单条数据 */
  execute(
    plan: MigrationPlan,
    validation: MigrationReport,
    sourceData: FormData,
    options: ExecutionOptions = {},
  ): ExecutionReport {
    return this.run(plan, validation, [sourceData], options, true)
  }

  /** 批量执行：逐条独立处理，互不影响 */
  executeBatch(
    plan: MigrationPlan,
    validation: MigrationReport,
    sourceDataList: FormData[],
    options: ExecutionOptions = {},
  ): ExecutionReport {
    return this.run(plan, validation, sourceDataList, options, false)
  }

  private run(
    plan: MigrationPlan,
    validation: MigrationReport,
    records: FormData[],
    options: ExecutionOptions,
    single: boolean,
  ): ExecutionReport {
    const dryRun = options.dryRun ?? true
    const migrationId = buildMigrationId(plan)

    const base: ExecutionReport = {
      migrationId,
      formId: plan.formId,
      sourceVersion: plan.fromVersion,
      targetVersion: plan.toVersion,
      status: 'success',
      dryRun,
      warnings: [...validation.warnings],
      failures: [],
    }

    /* ① 校验门禁：error 直接拒绝，不产生任何数据变更 */
    if (validation.status === 'error') {
      return {
        ...base,
        status: 'failed',
        failures: [
          {
            index: -1,
            reason: `validation 未通过，禁止执行: ${validation.errors.join('；')}`,
          },
        ],
      }
    }

    /* ② 幂等检查：已成功执行过的路径不重复转换 */
    const meta = this.metaStore.getOrInit(
      migrationId,
      plan.fromVersion,
      plan.toVersion,
    )
    if (meta.executed) {
      return { ...base, status: 'alreadyExecuted' }
    }

    /* ③ 逐条执行（失败被隔离在单条之内） */
    const items: BatchItemResult[] = records.map((record, index) =>
      this.executeOneRecord(plan, record, index),
    )

    const allFailures = items.flatMap((item) => item.failures)
    const status = aggregateStatus(items)

    // 仅整体成功才标记已执行；partial 保留可重试
    if (status === 'success') this.metaStore.markExecuted(migrationId)

    if (single) {
      const only = items[0]
      return {
        ...base,
        status,
        migratedData: only.data,
        operations: only.operations,
        failures: only.failures,
      }
    }

    return {
      ...base,
      status,
      items,
      failures: allFailures,
    }
  }

  /** 执行单条记录：任何策略抛错都被捕获为本条 failure */
  private executeOneRecord(
    plan: MigrationPlan,
    sourceData: FormData,
    index: number,
  ): BatchItemResult {
    const source = deepClone(sourceData)
    const working: Record<string, unknown> = {}
    const operations: OperationLogEntry[] = []
    const failures: FailureEntry[] = []

    const ctx: StrategyContext = {
      source,
      working,
      log(entry) {
        operations.push({ timestamp: Date.now(), ...entry })
      },
    }

    // 先执行字段映射，再补默认值（默认值可与转换产物在同一对象上共存）
    for (const mapping of plan.fieldMappings) {
      try {
        if (mapping.transform === 'identity') {
          executeFieldCopy(mapping, ctx)
        } else {
          executeTransform(mapping, this.transforms, ctx)
        }
      } catch (error) {
        failures.push({
          index,
          reason: error instanceof Error ? error.message : String(error),
          field: mapping.target,
        })
      }
    }

    for (const defaultValue of plan.defaults) {
      try {
        executeDefaultValue(defaultValue, ctx)
      } catch (error) {
        failures.push({
          index,
          reason: error instanceof Error ? error.message : String(error),
          field: defaultValue.field,
        })
      }
    }

    return {
      index,
      status: failures.length > 0 ? 'failed' : 'success',
      data: working as unknown as FormData,
      operations,
      failures,
    }
  }
}

/** 汇总批量状态：全成功 success / 全失败 failed / 否则 partial */
function aggregateStatus(items: BatchItemResult[]): ExecutionReport['status'] {
  const failedCount = items.filter((i) => i.status === 'failed').length
  if (failedCount === 0) return 'success'
  if (failedCount === items.length) return 'failed'
  return 'partial'
}

export function buildMigrationId(plan: MigrationPlan): string {
  return `${plan.formId}-${plan.fromVersion}-${plan.toVersion}`
}
