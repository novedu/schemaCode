import type { FormData, Schema } from '../../types'
import { defaultFieldState } from '../../engine/field-state'
import type { MigrationPlan } from '../types'

/**
 * 迁移演示专用 Schema（与 schema-version 下的扁平 orderFormV2 不同，
 * 这里按 Migration 教学场景把 v2 的 amount 设计为对象结构）：
 *
 *   v1: { amount: number }                      精度 4
 *   v2: { amount: { value: number, currency: string } }  精度 2
 *
 * 这些 Schema 只用于离线迁移校验，不进入 Runtime 渲染主链路。
 */

/** v1：扁平金额字段，精度 4 */
export const migrationOrderV1: Schema = {
  fields: [
    {
      name: 'amount',
      label: '金额',
      type: 'number',
      props: { precision: 4 },
      initialState: defaultFieldState({ required: true }),
    },
  ],
}

/** v2：金额对象，内含数值与币种 */
export const migrationOrderV2: Schema = {
  fields: [
    {
      name: 'amount',
      label: '金额',
      type: 'object',
      shape: {
        value: { type: 'number', required: true, precision: 2 },
        currency: { type: 'string', required: true },
      },
      initialState: defaultFieldState({ required: true }),
    },
  ],
}

/**
 * v1 → v2 迁移计划：
 *   amount       → amount.value   经 numberToMoney 转换
 *   amount.currency 缺省取 CNY（仅声明，不执行）
 */
export const orderMigrationPlan: MigrationPlan = {
  formId: 'orderForm',
  fromVersion: 'v1',
  toVersion: 'v2',
  fieldMappings: [
    { source: 'amount', target: 'amount.value', transform: 'numberToMoney' },
  ],
  defaults: [
    { field: 'amount.currency', value: 'CNY' },
  ],
}

/** 样本数据（历史 v1 数据；校验全程保持不变） */
export const migrationSampleData: FormData = {
  customerType: 'person',
  companyName: '',
  registeredCapital: 0,
  amount: 6000,
  approveComment: '',
}
