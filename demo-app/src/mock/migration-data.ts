import type { FormData } from '@runtime-core/types'
import {
  migrationOrderV1,
  migrationOrderV2,
  migrationSampleData,
  orderMigrationPlan,
} from '@runtime-core/migration/demo/order-migration-schemas'

/**
 * 迁移演示数据装配
 *
 * 两端 Schema、迁移计划、样本数据全部来自 Runtime Core 的迁移模块，
 * demo-app 只做编排：Validation → Dry Run → Execution。
 */
export { migrationOrderV1, migrationOrderV2, orderMigrationPlan, migrationSampleData }

/** 另造一条"源字段缺失"的坏计划，用于演示校验失败场景 */
import type { MigrationPlan } from '@runtime-core/migration/types'

export const brokenMigrationPlan: MigrationPlan = {
  ...orderMigrationPlan,
  fieldMappings: [
    { source: 'price', target: 'amount.value', transform: 'numberToMoney' },
  ],
}

export function cloneSample(): FormData {
  return structuredClone(migrationSampleData)
}
